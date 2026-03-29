from fastapi import FastAPI, Response
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
import statistics
from datetime import datetime, timezone
import asyncio
import os
from pyppeteer import launch
from pydantic import BaseModel
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = FastAPI()

# MongoDB Configuration
MONGODB_URL = "mongodb://localhost:27017"
DB_NAME = "NetworkAnalysis"
COLLECTION_NAME = "http_analysis_with_tcp3"

client = AsyncIOMotorClient(MONGODB_URL)
db = client[DB_NAME]
collection = db[COLLECTION_NAME]

@app.get("/api/dashboard")
async def get_dashboard_data():
    # ... (Keep existing implementation)
    pipeline = [
        {"$match": {"type": {"$in": ["request", "response"]}}},
        {"$group": {
            "_id": "$time",
            "requests": {"$sum": {"$cond": [{"$eq": ["$type", "request"]}, 1, 0]}},
            "responses": {"$sum": {"$cond": [{"$eq": ["$type", "response"]}, 1, 0]}},
            "avg_response_time": {"$avg": {"$cond": [{"$eq": ["$type", "response"]}, "$response_time", None]}}
        }},
        {"$sort": {"_id": -1}},
        {"$limit": 60}
    ]
    cursor = collection.aggregate(pipeline)
    timeseries = await cursor.to_list(length=60)
    timeseries.reverse()

    rps_values = [t["requests"] for t in timeseries] or [0]
    respps_values = [t["responses"] for t in timeseries] or [0]

    def calc_stats(data):
        data = list(data)
        if not data:
            return {"min": 0, "max": 0, "avg": 0, "stdev": 0, "p95": 0, "p99": 0}
        data.sort()
        n = len(data)
        return {
            "min": min(data),
            "max": max(data),
            "avg": sum(data) / n,
            "stdev": statistics.stdev(data) if n > 1 else 0,
            "p95": data[int(n * 0.95)] if n > 0 else 0,
            "p99": data[int(n * 0.99)] if n > 0 else 0
        }

    resp_time_pipeline = [{"$match": {"type": "response"}}, {"$project": {"response_time": 1, "request_size": 1}}]
    resp_data = await collection.aggregate(resp_time_pipeline).to_list(length=10000)
    resp_times = [d["response_time"] for d in resp_data if "response_time" in d]
    req_data_pipeline = [{"$match": {"type": "response", "request_size": {"$gt": 0}}}, {"$project": {"request_size": 1}}]
    req_sizes_data = await collection.aggregate(req_data_pipeline).to_list(length=10000)
    req_sizes = [d["request_size"] for d in req_sizes_data if "request_size" in d]

    endpoints = await collection.aggregate([
        {"$match": {"type": "request", "endpoint": {"$ne": ""}}},
        {"$group": {"_id": "$endpoint", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}, {"$limit": 5}
    ]).to_list(length=5)
    
    ports = await collection.aggregate([
        {"$match": {"type": "request", "port": {"$ne": None}}},
        {"$group": {"_id": "$port", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}, {"$limit": 5}
    ]).to_list(length=5)

    return {
        "timeseries": timeseries,
        "collection": COLLECTION_NAME,
        "stats": {
            "rps": calc_stats(rps_values),
            "respps": calc_stats(respps_values),
            "response_time": calc_stats(resp_times),
            "request_size": calc_stats(req_sizes)
        },
        "top_endpoints": endpoints,
        "top_ports": ports
    }

@app.get("/api/raw-data")
async def get_raw_data(limit: int = 200):
    cursor = collection.find({}).sort("_id", -1).limit(limit)
    data = await cursor.to_list(length=limit)
    for doc in data:
        doc["_id"] = str(doc.get("_id", ""))
    return {"data": data}


import urllib.request
import json

class AlertMessage(BaseModel):
    message: str

@app.post("/api/send-alert")
def send_alert(alert: AlertMessage):
    print(f"--- DISCORD ALERT TRIGGERED ---")
    print(f"Message: {alert.message}")
    print(f"-------------------------------")
    
    webhook_url = os.getenv("DISCORD_WEBHOOK_URL", "")
    if not webhook_url:
        print("Error: DISCORD_WEBHOOK_URL is not set.")
        return {"status": "error", "message": "Discord Webhook URL not configured."}

    payload = {
        "embeds": [
            {
                "title": "🚨 Alert",
                "description": alert.message,
                "color": 16711680,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "footer": {
                    "text": "Network Analysis Dashboard"
                }
            }
        ]
    }
    
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "NetworkAnalysisBot/1.0"
    }

    try:
        req = urllib.request.Request(webhook_url, data=json.dumps(payload).encode(), headers=headers)
        with urllib.request.urlopen(req) as response:
            result = response.read()
        print("Discord alert sent successfully.")
        return {"status": "success", "message": "Alert sent to Discord."}
    except Exception as e:
        print(f"Failed to send Discord alert: {e}")
        return {"status": "error", "message": str(e)}

# Serve static files
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
