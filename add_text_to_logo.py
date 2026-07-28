from PIL import Image, ImageDraw, ImageFont
import numpy as np
import os

def process():
    input_path = r"C:\Users\andan\.gemini\antigravity-ide\brain\5eb5f6b2-f2b3-444d-8278-3a07384a6b2c\media__1784365944974.png"
    img = Image.open(input_path).convert("RGBA")
    
    width, height = img.size
    
    # Create white background
    bg = Image.new("RGB", img.size, (255, 255, 255))
    # If image has alpha channel, paste using alpha as mask
    bg.paste(img, (0, 0), img.split()[3])
    
    gray = bg.convert("L")
    inv_bw = gray.point(lambda x: 255 if x < 240 else 0)
    img_bbox = inv_bw.getbbox()
    
    if img_bbox:
        left, upper, right, lower = img_bbox
    else:
        left, upper, right, lower = 0, 0, width, height
        
    content = img.crop((left, upper, right, lower))
    c_w, c_h = content.size
    
    # text 
    text = "중화권 마케팅 에이전시"
    font_path = r"C:\Windows\Fonts\malgunbd.ttf"
    
    padding = int(c_w * 0.2)
    spacing = int(c_h * 0.4)
    font_size = int(c_w * 0.08)
    font = ImageFont.truetype(font_path, font_size)
    
    dummy_canvas = Image.new("RGB", (100, 100))
    draw = ImageDraw.Draw(dummy_canvas)
    bbox2 = draw.textbbox((0, 0), text, font=font)
    text_w = bbox2[2] - bbox2[0]
    text_h = bbox2[3] - bbox2[1]
    
    new_w = max(c_w, text_w) + padding * 2
    new_h = c_h + spacing + text_h + padding * 2
    
    final_canvas = Image.new("RGB", (new_w, new_h), (255, 255, 255))
    
    logo_x = (new_w - c_w) // 2
    logo_y = padding
    final_canvas.paste(content, (logo_x, logo_y), content if content.mode == 'RGBA' else None)
    
    draw = ImageDraw.Draw(final_canvas)
    text_x = (new_w - text_w) // 2
    text_y = logo_y + c_h + spacing - bbox2[1]
    
    # Use dark blue color
    text_color = (20, 60, 110)
    draw.text((text_x, text_y), text, fill=text_color, font=font)
    
    # og:image (1200x630)
    og_canvas = Image.new("RGB", (1200, 630), "white")
    scale = min(1200 * 0.7 / new_w, 630 * 0.7 / new_h)
    sw = int(new_w * scale)
    sh = int(new_h * scale)
    final_resized = final_canvas.resize((sw, sh), Image.Resampling.LANCZOS)
    
    ox = (1200 - sw) // 2
    oy = (630 - sh) // 2
    og_canvas.paste(final_resized, (ox, oy))
    
    out_path = r"C:\Users\andan\.gemini\antigravity-ide\brain\5eb5f6b2-f2b3-444d-8278-3a07384a6b2c\og_image_v5.png"
    og_canvas.save(out_path)
    print("Created preview at", out_path)
    
    # Save to public
    og_canvas.save("public/og_image.png")
    
    sq_size = 512
    sq_canvas = Image.new("RGB", (sq_size, sq_size), "white")
    scale_sq = min(sq_size * 0.9 / new_w, sq_size * 0.9 / new_h)
    sw_sq = int(new_w * scale_sq)
    sh_sq = int(new_h * scale_sq)
    sq_resized = final_canvas.resize((sw_sq, sh_sq), Image.Resampling.LANCZOS)
    sq_x = (sq_size - sw_sq) // 2
    sq_y = (sq_size - sh_sq) // 2
    sq_canvas.paste(sq_resized, (sq_x, sq_y))
    sq_canvas.save("public/favicon_v4.png")
    print("Created public files")

if __name__ == "__main__":
    process()
