import struct
import time
import requests
import sounddevice as sd

URL = "http://172.22.0.11:8081/v1/tts"
PAYLOAD = {
    "text": "The first light of dawn spills over the low hills of Eldoria, gilding the thatch roofs of a small village that has stood since the old stone walls of the capital were still fresh. As the rooster crows, a faint, metallic tang lingers in the air—an omen that the earth below is stirring again.\
                Time: Day 1,08:00 AM\
                Location: Dawnridge Village, outskirts of the kingdom's western border\
                \
                \
                You stand on the village's main road, a dusty path that snakes between stone cottages and a modest wooden market stall. The market is just beginning to buzz: a blacksmith's hammer echoes from the forge, a baker's scent of fresh bread wafts through the air, and a traveling merchant hawks a curious, glowing crystal to an eager child.\
                \
                \
                A sudden tremor rattles the ground, a faint rumble that feels more like a sigh than a quake. The villagers glance around, uneasy. A tall, weathered man—perhaps the village elder—steps forward. His beard is peppered with gray, but his eyes still burn with a fierce, old fire.\
                \
                \
                Strangers, he says, voice steady but urgent. The ground has shifted. The old stone walls, the ones we’ve walked along for generations, feel… different. I’ve heard whispers in the market that the elder wyrms are stirring beneath our feet. If the dragons awaken, the world will change. We need allies. Will you help us protect Dawnridge from whatever may come?",
    "streaming": True,
    "format": "wav",
    "reference_id": "bg3_narrator",
}
HEADERS = {
    "Content-Type": "application/json",
    # "Authorization": "Bearer <your_token>",  # if needed
}

def main():
    t0 = time.time()
    with requests.post(URL, json=PAYLOAD, headers=HEADERS, stream=True) as r:
        r.raise_for_status()
        raw = r.raw
        raw.decode_content = False  # keep raw bytes

        # Read exact 44-byte WAV header (no buffering)
        header = raw.read(44)
        if len(header) < 44:
            raise RuntimeError(f"Received only {len(header)} bytes for header")

        if header[:4] != b"RIFF" or header[8:12] != b"WAVE":
            raise RuntimeError("Did not receive a WAV header (is the server restarted?)")

        sample_rate = struct.unpack("<I", header[24:28])[0]
        bits_per_sample = struct.unpack("<H", header[34:36])[0]
        if bits_per_sample != 16:
            raise RuntimeError(f"Unexpected bit depth: {bits_per_sample}")

        print(f"Header received at {time.time() - t0:.2f}s — {sample_rate} Hz, {bits_per_sample}-bit")

        # Stream audio as it arrives
        with sd.RawOutputStream(
            samplerate=sample_rate, channels=1, dtype="int16", blocksize=0
        ) as out:
            while True:
                chunk = raw.read(4096)
                if not chunk:
                    break
                out.write(chunk)

if __name__ == "__main__":
    main()