"""自行合成示例素材，无第三方录音；运行 python3 scripts/generate_sounds.py 可重建。"""
import math, random, wave, struct
from pathlib import Path
out = Path(__file__).resolve().parent.parent / 'public/assets/sounds'
out.mkdir(parents=True, exist_ok=True)
for index, name in enumerate(['glass', 'wood', 'rain', 'bell', 'water', 'wind', 'drum', 'chime', 'shaker', 'pluck']):
    rng = random.Random(index)
    rate, duration = 22050, 2
    samples = []
    smooth = 0
    for i in range(rate * duration):
        t = i / rate
        noise = rng.uniform(-1, 1)
        smooth = smooth * .96 + noise * .04
        if name in ['rain', 'wind', 'shaker']:
            value = (smooth * 3 if name == 'wind' else noise * .35) * (math.sin(math.pi*t/duration)**2)
            if name == 'shaker': value *= (.5 + .5*math.sin(t*45))
        elif name == 'water':
            value = .5*math.sin(2*math.pi*(500*t+180*math.sin(t*7))) * math.exp(-t*3) * min(1,t*100)
        else:
            freq = [960, 220, 0, 660, 0, 0, 85, 1320, 0, 330][index]
            decay = [4, 12, 0, 2, 0, 0, 9, 3, 0, 5][index]
            value = (.55*math.sin(2*math.pi*freq*t) + .17*math.sin(2*math.pi*freq*2.71*t))*math.exp(-t*decay)*min(1,t*200)
        samples.append(struct.pack('<h', int(max(-1,min(1,value)) * 26000)))
    with wave.open(str(out / (name+'.wav')), 'wb') as f:
        f.setparams((1,2,rate,0,'NONE','not compressed'))
        f.writeframes(b''.join(samples))
