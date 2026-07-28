import urllib.request
import re

try:
    html = urllib.request.urlopen('https://www.tamkorea.com').read().decode('utf-8')
    m = re.search(r'<meta property="og:image" content="(.*?)"', html)
    if m:
        print("Live og:image:", m.group(1))
    else:
        print("og:image not found in live HTML.")
        
    m2 = re.search(r'<link rel="icon".*?href="(.*?)"', html)
    if m2:
        print("Live favicon:", m2.group(1))
except Exception as e:
    print("Error:", e)
