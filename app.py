import os
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from collections import OrderedDict
import re

app = Flask(__name__, static_url_path='/static')
CORS(app)

CATEGORIES_FILE = 'list-categories.txt'
ICONS_BASE_PATH = 'assets/game-icons.net/'

def read_categories():
    categories = OrderedDict()
    print(f"Reading categories from {CATEGORIES_FILE}")
    with open(CATEGORIES_FILE, 'r') as file:
        for line_number, line in enumerate(file, 1):
            line = line.strip()
            if not line:  # Skip empty lines
                continue
            try:
                category, icon = line.split(': ', 1)
                if category not in categories:
                    categories[category] = []
                
                # Append .svg extension if it's missing
                if not icon.lower().endswith('.svg'):
                    icon += '.svg'
                
                icon_path = os.path.join(ICONS_BASE_PATH, icon)
                print(f"Checking icon path: {icon_path}")
                if os.path.exists(icon_path):
                    categories[category].append(icon)
                    print(f"Added icon {icon} to category {category}")
                else:
                    print(f"Warning: Icon file not found: {icon_path}")
            except ValueError:
                print(f"Warning: Invalid format in line {line_number}: {line}")
    
    print("Final categories:")
    for category, icons in categories.items():
        print(f"{category}: {len(icons)} icons")
    
    return categories

def write_categories(categories):
    # Create a mapping of icon to category
    icon_to_category = {}
    for category, icons in categories.items():
        for icon in icons:
            icon_to_category[re.sub(r'\.svg$', '', icon)] = category

    updated_lines = []

    with open(CATEGORIES_FILE, 'r') as file:
        for line in file:
            line = line.strip()
            if not line:
                updated_lines.append('\n')
                continue
            try:
                category, icon = line.split(': ', 1)
                if icon in icon_to_category:
                    new_category = icon_to_category[icon]
                    if new_category != category:
                        updated_lines.append(f"{new_category}: {icon}\n")
                    else:
                        updated_lines.append(line + '\n')
                else:
                    updated_lines.append(line + '\n')
            except ValueError:
                updated_lines.append(line + '\n')

    with open(CATEGORIES_FILE, 'w') as file:
        file.writelines(updated_lines)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/assets/game-icons.net/<path:icon_path>')
def get_icon(icon_path):
    with open(os.path.join(ICONS_BASE_PATH, icon_path), 'r') as file:
        return file.read(), 200, {'Content-Type': 'image/svg+xml'}

@app.route('/categories')
def get_categories():
    categories = read_categories()
    return jsonify({
        category: sorted(icons, key=lambda x: os.path.basename(x).lower())
        for category, icons in categories.items()
    })

@app.route('/update', methods=['POST'])
def update_category():
    data = request.json
    categories = read_categories()
    
    # Remove the icons from their old categories
    for category in categories.values():
        for icon in data['icons']:
            if icon in category:
                category.remove(icon)
    
    # Add the icons to their new category
    if data['newCategory'] not in categories:
        categories[data['newCategory']] = []
    categories[data['newCategory']].extend(data['icons'])
    
    write_categories(categories)
    return jsonify({"success": True})

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    app.run(debug=True)