from PIL import Image
import numpy as np
import os

def process():
    input_path = r"C:\Users\andan\.gemini\antigravity-ide\brain\5eb5f6b2-f2b3-444d-8278-3a07384a6b2c\media__1784363802199.png"
    if not os.path.exists(input_path):
        print("Input file not found.")
        return

    img = Image.open(input_path).convert("RGB")
    data = np.array(img, dtype=float)

    # Convert to grayscale
    gray = np.dot(data[..., :3], [0.2989, 0.5870, 0.1140])

    # Find min and max to normalize
    g_min = np.min(gray)
    g_max = np.max(gray)

    # Normalize to 0-1
    normalized = (gray - g_min) / (g_max - g_min)

    # Increase contrast slightly
    normalized = np.clip((normalized - 0.2) / (0.7 - 0.2), 0, 1)

    # Purple: (92, 25, 221)
    # White: (255, 255, 255)
    purple = np.array([92, 25, 221], dtype=float)
    white = np.array([255, 255, 255], dtype=float)

    new_data = np.zeros_like(data)
    for i in range(3):
        new_data[..., i] = normalized * white[i] + (1 - normalized) * purple[i]

    new_img = Image.fromarray(new_data.astype(np.uint8))

    # Save as og_image (centered on a 1200x630 canvas)
    canvas_w, canvas_h = 1200, 630
    og_canvas = Image.new("RGB", (canvas_w, canvas_h), "white")
    
    target_w = int(canvas_w * 0.6)
    ratio = target_w / new_img.width
    target_h = int(new_img.height * ratio)
    
    # If the scaled image is taller than the canvas, scale by height instead
    if target_h > canvas_h * 0.8:
        target_h = int(canvas_h * 0.8)
        ratio = target_h / new_img.height
        target_w = int(new_img.width * ratio)
        
    resized = new_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

    x = (canvas_w - target_w) // 2
    y = (canvas_h - target_h) // 2
    og_canvas.paste(resized, (x, y))
    
    os.makedirs("public", exist_ok=True)
    og_canvas.save("public/og_image.png")

    # Save as favicon (square)
    fav_size = 512
    fav_canvas = Image.new("RGB", (fav_size, fav_size), "white")
    
    f_target_w = int(fav_size * 0.8)
    f_ratio = f_target_w / new_img.width
    f_target_h = int(new_img.height * f_ratio)
    
    if f_target_h > fav_size * 0.8:
        f_target_h = int(fav_size * 0.8)
        f_ratio = f_target_h / new_img.height
        f_target_w = int(new_img.width * f_ratio)
        
    f_resized = new_img.resize((f_target_w, f_target_h), Image.Resampling.LANCZOS)
    
    fx = (fav_size - f_target_w) // 2
    fy = (fav_size - f_target_h) // 2
    fav_canvas.paste(f_resized, (fx, fy))
    fav_canvas.save("public/favicon_v3.png")

    print("Created public/og_image.png and public/favicon_v3.png")

if __name__ == "__main__":
    process()
