class GridButton extends PersistentToolbarToggleButton {
  constructor() {
    super('grid_4x4', 'Grid', 'Toggle grid lines.');
  }

  toggle(state) {
  
    if (state) {
      const gridMajor = Number(getComputedStyle(document.body).getPropertyValue('--gridMajor'));
      $('body').classList.toggle(`gridLines${gridMajor === 0 ? '' : gridMajor}`, state);
      showOverlay('gridOverlay');
      const modal = document.querySelector('#gridOverlay > .modal');
      modal.innerHTML = `<div class="inputtitle"><label>Grid Options</label></div>`;
      
      const addInputField = (labelText, inputElement) => {
        const gridInputField = document.createElement('div');
        gridInputField.className = 'button-bar';
        gridInputField.innerHTML = `<label>${labelText}</label>`;
        gridInputField.appendChild(inputElement);
        modal.appendChild(gridInputField);
      };
    
      const createInput = (type, id, placeholder, classList, eventListener) => {
        const input = document.createElement('input');
        input.type = type;
        input.id = id;
        input.placeholder = placeholder;
        input.classList.add(...classList);
        if (eventListener) {
          input.addEventListener('input', eventListener);
        }
        return input;
      };
    
      const currentGridSize = getComputedStyle(document.body).getPropertyValue('--gridSize').replace(/[^0-9.]/g, '');
      const gridSizeInput = createInput('text', 'gridSizeInput', currentGridSize, ['gridFields'], e => {
        const gridSizeValue = e.target.value.replace(/[^0-9.]/g, '') + 'px';
        document.body.style.setProperty('--gridSize', gridSizeValue);
      });
      addInputField('Grid px size:  ', gridSizeInput);
    
      const colorInput = createInput('color', 'colorPicker', '', ['gridFields'], e => {
        document.body.style.setProperty('--gridColor', e.target.value);
      });
      const currentGridColor = getComputedStyle(document.body).getPropertyValue('--gridColor');
      colorInput.value = currentGridColor;
      addInputField('Grid color:  ', colorInput);
    
      const majorLineDropdown = document.createElement('select');
      majorLineDropdown.id = 'majorLineDropdown';
      majorLineDropdown.classList.add('gridFields');
      addInputField('Major lines:  ', majorLineDropdown);

      const options = [
        { text: 'None', value: 0 },
        { text: '1/3', value: 33 },
        { text: '1/4', value: 25 },
        { text: '1/5', value: 20 },
      ];
    
      options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        if (option.value === gridMajor) {
          optionElement.selected = true;
        }
        majorLineDropdown.appendChild(optionElement);
      });
    
      majorLineDropdown.addEventListener('change', e => {
        const selectedOption = e.target.value;
    
        switch (selectedOption) {
          case '0':
            $('body').classList.remove('gridLines33', 'gridLines25', 'gridLines20');
            $('body').classList.add('gridLines');
            document.body.style.setProperty('--gridMajor', 0);
            break;
          case '33':
            $('body').classList.remove('gridLines', 'gridLines25', 'gridLines20');
            $('body').classList.add('gridLines33');
            document.body.style.setProperty('--gridMajor', 33);
            break;
          case '25':
            $('body').classList.remove('gridLines', 'gridLines33', 'gridLines20');
            $('body').classList.add('gridLines25');
            document.body.style.setProperty('--gridMajor', 25);
            break;
          case '20':
            $('body').classList.remove('gridLines', 'gridLines33', 'gridLines25');
            $('body').classList.add('gridLines20');
            document.body.style.setProperty('--gridMajor', 20);
            break;
        }
      });

      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'close';
      cancelButton.addEventListener('click', () => showOverlay('gridOverlay'));
      cancelButton.className = 'ui-button pilecancelbutton material-symbols';
      $('#gridOverlay > .modal').appendChild(document.createElement('div').appendChild(cancelButton));
    } else {
      $('body').classList.remove('gridLines', 'gridLines33', 'gridLines25', 'gridLines20');
      const gridOverlay = document.querySelector('#gridOverlay');
      if (gridOverlay && gridOverlay.style.display !== 'none') {
        showOverlay('gridOverlay');
      }  
    }
  }
}