class GridButton extends PersistentToolbarToggleButton {
  constructor() {
    super('grid_4x4', 'Grid', 'Toggle grid lines.');
  }

  toggle(state) {
  
    if (state) {
      $('body').classList.toggle('gridLines', state);
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
    
      const gridSizeInput = createInput('text', 'gridSizeInput', '', ['gridFields'], e => {
        const gridSizeValue = e.target.value.replace(/[^0-9.]/g, '') + 'px';
        document.body.style.setProperty('--gridSize', gridSizeValue);
      });
      addInputField('Grid px size:  ', gridSizeInput);
    
      const colorInput = createInput('color', 'colorPicker', '', ['gridFields'], e => {
        document.body.style.setProperty('--gridColor', e.target.value);
      });
      colorInput.value = '#c0c0c0';
      addInputField('Grid color:  ', colorInput);
    
      const majorLineDropdown = document.createElement('select');
      majorLineDropdown.id = 'majorLineDropdown';
      majorLineDropdown.classList.add('gridFields');
      addInputField('Major lines:  ', majorLineDropdown);
    
      const options = [
        { text: 'None', value: 'none' },
        { text: '1/3', value: '1/3' },
        { text: '1/4', value: '1/4' },
        { text: '1/5', value: '1/5' },
      ];
    
      options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        if (option.value === 'None') {
          optionElement.selected = true;
        }
        majorLineDropdown.appendChild(optionElement);
      });
    
      majorLineDropdown.addEventListener('change', e => {
        const selectedOption = e.target.value;
    
        switch (selectedOption) {
          case 'none':
            $('body').classList.remove('gridLines33', 'gridLines25', 'gridLines20');
            $('body').classList.add('gridLines');
            break;
          case '1/3':
            $('body').classList.remove('gridLines', 'gridLines25', 'gridLines20');
            $('body').classList.add('gridLines33');
            break;
          case '1/4':
            $('body').classList.remove('gridLines', 'gridLines33', 'gridLines20');
            $('body').classList.add('gridLines25');
            break;
          case '1/5':
            $('body').classList.remove('gridLines', 'gridLines33', 'gridLines25');
            $('body').classList.add('gridLines20');
            break;
        }
      });

      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'close';
      cancelButton.addEventListener('click', () => showOverlay('gridOverlay'));
      cancelButton.className = 'ui-button pilecancelbutton material-icons';
      $('#gridOverlay > .modal').appendChild(document.createElement('div').appendChild(cancelButton));
    } else {
      $('body').classList.remove('gridLines', 'gridLines33', 'gridLines25', 'gridLines20');
      document.querySelector('#gridOverlay').style.display = 'none';  
    }
  }
}