document.addEventListener('DOMContentLoaded', () => {
    const categoriesContainer = document.getElementById('categories');
    const iconsContainer = document.getElementById('icons');
    const assignContainer = document.getElementById('assign');
    let currentCategory = null;
    let selectedIcons = new Set();
    let allCategories = {};

    function fetchCategories() {
        fetch('/categories')
            .then(response => response.json())
            .then(categories => {
                allCategories = categories;
                categoriesContainer.innerHTML = '';
                Object.entries(categories).forEach(([category, icons]) => {
                    const button = document.createElement('button');
                    button.textContent = `${category} (${icons.length})`;
                    button.onclick = () => loadCategory(category, icons);
                    categoriesContainer.appendChild(button);
                });
            });
    }

    function loadCategory(category, icons) {
        currentCategory = category;
        iconsContainer.innerHTML = '';
        
        const selectAllButton = document.createElement('button');
        selectAllButton.textContent = 'Select All';
        selectAllButton.onclick = () => selectAllIcons(icons);
        iconsContainer.appendChild(selectAllButton);

        icons.forEach(icon => {
            const img = document.createElement('img');
            img.src = `/assets/game-icons.net/${icon}`;
            img.alt = icon;
            img.title = icon.split('/').pop().replace('.svg', '');
            img.onclick = () => toggleIconSelection(icon, img);
            iconsContainer.appendChild(img);
        });

        updateAssignContainer();
    }

    function toggleIconSelection(icon, img) {
        if (selectedIcons.has(icon)) {
            selectedIcons.delete(icon);
            img.style.border = 'none';
        } else {
            selectedIcons.add(icon);
            img.style.border = '2px solid blue';
        }
        updateAssignContainer();
    }

    function selectAllIcons(icons) {
        icons.forEach(icon => {
            selectedIcons.add(icon);
            const img = iconsContainer.querySelector(`img[alt="${icon}"]`);
            if (img) img.style.border = '2px solid blue';
        });
        updateAssignContainer();
    }

    function updateAssignContainer() {
        assignContainer.innerHTML = '';
        if (selectedIcons.size > 0) {
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'New category';
            assignContainer.appendChild(input);

            const button = document.createElement('button');
            button.textContent = 'Assign';
            button.onclick = () => assignToCategory(input.value);
            assignContainer.appendChild(button);

            Object.keys(allCategories).forEach(category => {
                const shortcutButton = document.createElement('button');
                shortcutButton.textContent = `-> ${category}`;
                shortcutButton.onclick = () => assignToCategory(category);
                assignContainer.appendChild(shortcutButton);
            });
        }
    }

    function assignToCategory(newCategory) {
        const icons = Array.from(selectedIcons);
        fetch('/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newCategory, icons })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                selectedIcons.clear();
                fetchCategories();
                if (currentCategory) {
                    loadCategory(currentCategory, allCategories[currentCategory].filter(icon => !icons.includes(icon)));
                }
            } else {
                console.error('Failed to assign category');
            }
        });
    }

    fetchCategories();
});