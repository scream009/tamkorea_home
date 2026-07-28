from PIL import Image, ImageDraw, ImageFont
import urllib.request
import os

def create_text_logo():
    font_path = r"C:\Windows\Fonts\malgunbd.ttf"
    if not os.path.exists(font_path):
        print("Font not found!")
        return

    # 1. og:image (1200x630)
    width, height = 1200, 630
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)

    font_size = 200
    font = ImageFont.truetype(font_path, font_size)
    text = "탐코리아"
    
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    x = (width - text_w) / 2
    y = (height - text_h) / 2 - bbox[1]

    draw.text((x, y), text, fill="#5c19dd", font=font)
    
    # Save to public directory
    os.makedirs("public", exist_ok=True)
    image.save("public/og_image.png")
    print("Created public/og_image.png")

    # 2. favicon (512x512)
    sq_size = 512
    sq_image = Image.new("RGB", (sq_size, sq_size), "white")
    sq_draw = ImageDraw.Draw(sq_image)
    
    sq_font_size = 140
    sq_font = ImageFont.truetype(font_path, sq_font_size)
    
    bbox = sq_draw.textbbox((0, 0), text, font=sq_font)
    sq_text_w = bbox[2] - bbox[0]
    sq_text_h = bbox[3] - bbox[1]
    
    sq_x = (sq_size - sq_text_w) / 2
    sq_y = (sq_size - sq_text_h) / 2 - bbox[1]
    
    sq_draw.text((sq_x, sq_y), text, fill="#5c19dd", font=sq_font)
    sq_image.save("public/favicon_v3.png")
    print("Created public/favicon_v3.png")

if __name__ == "__main__":
    create_text_logo()
