import os
from collections import defaultdict

def analyze_categories(file_path):
    # Dictionary to store categories and their icons
    categories = defaultdict(list)
    
    # Read the file and populate the categories dictionary
    with open(file_path, 'r') as file:
        for line in file:
            parts = line.strip().split(': ')
            if len(parts) == 2:
                category, icon = parts
                categories[category].append(icon)
    
    # List to store icons in categories with less than 10 icons
    small_category_icons = []
    
    # Analyze categories and collect icons from small categories
    for category, icons in categories.items():
        if len(icons) < 10:
            small_category_icons.extend(icons)
    
    return small_category_icons

def main():
    # Path to the list-categories.txt file
    file_path = os.path.expanduser("list-categories.txt")
    
    # Get the list of icons in small categories
    small_icons = analyze_categories(file_path)
    
    # Print the results
    print("Icons in categories with less than 10 icons:")
    for icon in sorted(small_icons):
        print(icon)
    print(f"\nTotal number of icons in small categories: {len(small_icons)}")

if __name__ == "__main__":
    main()