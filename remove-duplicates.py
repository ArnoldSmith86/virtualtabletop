import os

def remove_duplicates(input_file, output_file):
    # Dictionary to store the most recent category for each icon
    icon_categories = {}
    
    # Read the input file and update the dictionary
    with open(input_file, 'r') as file:
        for line in file:
            line = line.strip()
            parts = line.split(': ')
            if len(parts) == 2:
                category, icon = parts
                icon_categories[icon] = category
    
    # Write the deduplicated entries to the output file
    with open(output_file, 'w') as file:
        for icon, category in icon_categories.items():
            file.write(f"{category}: {icon}\n")

def main():
    # Paths for input and output files
    input_file = os.path.expanduser("list-categories.txt")
    output_file = os.path.expanduser("list-categories-deduped.txt")
    
    # Remove duplicates and write to new file
    remove_duplicates(input_file, output_file)
    
    # Count the number of entries in both files
    with open(input_file, 'r') as file:
        original_count = sum(1 for line in file if ': ' in line)
    
    with open(output_file, 'r') as file:
        new_count = sum(1 for line in file)
    
    # Print results
    print(f"Original file: {original_count} entries")
    print(f"Deduplicated file: {new_count} entries")
    print(f"Removed {original_count - new_count} duplicate entries")
    print(f"Deduplicated file saved as: {output_file}")

if __name__ == "__main__":
    main()