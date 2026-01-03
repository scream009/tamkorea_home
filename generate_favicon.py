from PIL import Image
import os

def create_icons(input_path, output_dir):
    try:
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        img = Image.open(input_path).convert("RGBA")
        
        # 1. Create favicon.png (Standard 32x32 or 192x192 for high DPI)
        # Using 192x192 to cover most modern cases including Android Chrome
        favicon_size = (192, 192)
        favicon = img.resize(favicon_size, Image.Resampling.LANCZOS)
        favicon_path = os.path.join(output_dir, "favicon.png")
        favicon.save(favicon_path, "PNG")
        print(f"Created {favicon_path}")
        
        # 2. Create logo.png (Original ratio, good for OG tag)
        # If original is too huge, maybe resize to max 1200 width?
        # For now, just saving a clean copy.
        logo_path = os.path.join(output_dir, "logo.png")
        img.save(logo_path, "PNG")
        print(f"Created {logo_path}")
        
    except Exception as e:
        print(f"Error processing image: {e}")

# Configuration
input_image = r"C:/Users/andan/.gemini/antigravity/brain/bb3895f8-2b1c-497c-9256-e72df2ebf60b/uploaded_image_1_1767415469732.png"
public_dir = r"d:\01 work\gravity\tamkorea_home\public"

create_icons(input_image, public_dir)
