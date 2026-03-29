import urllib.request
import json
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

webhook_url = os.getenv("DISCORD_WEBHOOK_URL")

payload = {
    "embeds": [
        {
            "title": "🚨 Network Performance Alert (Test)",
            "description": "Resp Time (150.2ms) > 100\nRPS (1200) > 1000",
            "color": 16711680,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "footer": {
                "text": "Network Analysis Dashboard"
            }
        }
    ]
}

headers = {"Content-Type": "application/json", "User-Agent": "NetworkAnalysisBot/1.0"}

req = urllib.request.Request(webhook_url, data=json.dumps(payload).encode(), headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode())
        print("Success! Discord message sent.")
except Exception as e:
    print("Error:", e)
