class PropertiesModule extends SidebarModule {
  constructor() {
    super('tune', 'Properties', 'Edit widget properties.');
  }

  inputValueUpdated(widget, property, value) {
    if(value.match(/^(-?[0-9]+(\.[0-9]+)?|null|true|false)$/))
      widget.set(property, JSON.parse(value));
    else
      widget.set(property, value);
  }

  onDeltaReceivedWhileActive(delta) {
    for(const widgetID in delta.s)
      if(delta.s[widgetID] && this.inputUpdaters[widgetID])
        for(const property in delta.s[widgetID])
          if(this.inputUpdaters[widgetID][property])
            this.inputUpdaters[widgetID][property](delta.s[widgetID][property]);
  }

  onSelectionChangedWhileActive(newSelection) {
    this.moduleDOM.innerHTML = '';
    this.inputUpdaters = {};

    for(const widget of newSelection) {
      const widgetName = document.createElement('h1');
      this.inputUpdaters[widget.id] = {};

      widgetName.innerText = widget.id;
      this.moduleDOM.append(widgetName);

      for(const property in widget.state) {
        if([ 'id', 'type', 'parent' ].indexOf(property) != -1)
          continue;

        const div = document.createElement('div');

        const label = document.createElement('label');
        label.htmlFor = "propertyModule"+property;
        label.textContent = property;
        label.style.display = 'inline-block';
        label.style.width = '100px';
        div.appendChild(label);

        if(typeof widget.state[property] != 'object') {
          const input = document.createElement('input');
          input.id = "propertyModule"+property;
          input.value = String(widget.state[property]);
          input.onkeyup = e=>this.inputValueUpdated(widget, property, input.value);
          this.inputUpdaters[widget.id][property] = v=>input.value=String(v);
          div.appendChild(input);
        }

        this.moduleDOM.append(div);
      }
    }
  }

  renderModule(target) {
    target.innerText = 'Properties module not implemented yet.';
  }
}
