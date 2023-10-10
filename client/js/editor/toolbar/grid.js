class GridButton extends PersistentToolbarToggleButton {
  constructor() {
    super('grid_4x4', 'Grid', 'Toggle grid lines.');
  }

  toggle(state) {
    $('body').classList.toggle('gridLines', state);
    document.querySelectorAll('#majorGridLinesV1, #majorGridLinesV2, #majorGridLinesH1, #majorGridLinesH2').forEach(el => {
      el.classList.toggle('majorLinesHidden', !state);
    });
  
    if (state) {
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
    
      const gridSizeInput = createInput('text', 'gridSizeInput', '25', ['gridFields'], e => {
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
        if (option.value === '1/4') {
          optionElement.selected = true;
        }
        majorLineDropdown.appendChild(optionElement);
      });
    
      majorLineDropdown.addEventListener('change', e => {
        const selectedOption = e.target.value;
        const majorLinesAll = document.querySelectorAll('#majorGridLinesV1, #majorGridLinesV2, #majorGridLinesH1, #majorGridLinesH2');
        const majorLines3 = document.querySelectorAll('#majorGridLinesV2, #majorGridLinesH2');
    
        switch (selectedOption) {
          case 'none':
            majorLinesAll.forEach(element => element.style.display = 'none');
            break;
          case '1/3':
            majorLines3.forEach(element => element.style.display = 'none');
            document.body.style.setProperty('--majorLineV', '533.33px');
            document.body.style.setProperty('--majorLineH', '333.33px');
            break;
          case '1/4':
            majorLinesAll.forEach(element => element.style.display = 'block');
            document.body.style.setProperty('--majorLineV', '400px');
            document.body.style.setProperty('--majorLineH', '250px');
            break;
          case '1/5':
            majorLinesAll.forEach(element => element.style.display = 'block');
            document.body.style.setProperty('--majorLineV', '320px');
            document.body.style.setProperty('--majorLineH', '200px');
            break;
        }
      });

      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'close';
      cancelButton.addEventListener('click', () => showOverlay('gridOverlay'));
      cancelButton.className = 'ui-button pilecancelbutton material-icons';
      $('#gridOverlay > .modal').appendChild(document.createElement('div').appendChild(cancelButton));
    } else {
      document.querySelector('#gridOverlay').style.display = 'none';   
    }
  }
}