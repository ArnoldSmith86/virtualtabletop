class PropertiesModule extends SidebarModule {
  constructor() {
    super('tune', 'Properties', 'Edit widget properties.');
  }

  addInput(labelText, value, target) {
    const div = document.createElement('div');
    const idPost = Math.random().toString(36).substring(3, 12);

    const label = document.createElement('label');
    label.htmlFor = "propertyModule"+idPost;
    label.textContent = labelText;
    label.style.display = 'inline-block';
    label.style.width = '100px';
    div.appendChild(label);

    (target || this.moduleDOM).append(div);

    if(typeof value != 'object') {
      const input = document.createElement('input');
      input.id = "propertyModule"+idPost;
      input.value = String(value);
      div.appendChild(input);
      return input;
    }
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
      this.addHeader(widget.id);
      this.inputUpdaters[widget.id] = {};

      for(const property in widget.state) {
        if([ 'id', 'type', 'parent' ].indexOf(property) != -1)
          continue;

        const input = this.addInput(property, widget.state[property])
        if(input) {
          input.onkeyup = e=>this.inputValueUpdated(widget, property, input.value);
          this.inputUpdaters[widget.id][property] = v=>input.value=String(v);
        }
      }

      if(widget.get('type') == 'card') {
        this.renderCardLayers(widget);
      }
    }
  }

  faceObjectInputValueUpdated(deck, face, object, property, value, card, removeObjects) {
    if(value.match(/^(-?[0-9]+(\.[0-9]+)?|null|true|false)$/))
      this.faceTemplates[face].objects[object][property] = JSON.parse(value);
    else
      this.faceTemplates[face].objects[object][property] = value;

    //card.applyDeltaToDOM({ deck: card.get('deck') });
    for(let objectCard=object; objectCard<this.cardLayerCards[face].length; ++objectCard) {
      const oCard = this.cardLayerCards[face][objectCard];
      oCard.domElement.innerHTML = '';
      oCard.createFaces(this.faceTemplates);
      for(let i=0; i<oCard.domElement.children.length; ++i)
        oCard.domElement.children[i].classList.toggle('active', i == oCard.get('activeFace'));
      removeObjects(oCard, objectCard);
    }
  }

  applyFaceTemplateChanges(deck) {
    deck.set('faceTemplates', this.faceTemplates);
  }

  renderCardLayers(widget) {
    const deck = widgets.get(widget.get('deck'));
    const faceTemplates = this.faceTemplates = JSON.parse(JSON.stringify(deck.get('faceTemplates')));

    this.cardLayerCards = [];

    for(const face in faceTemplates) {
      this.cardLayerCards[face] = [];

      if(face == 0)
        this.addHeader('Back face');
      else if(face == 1)
        this.addHeader('Front face');
      else
        this.addHeader(`Face ${face}`);

      for(const object in faceTemplates[face].objects) {
        const objectDiv = document.createElement('div');
        objectDiv.className = 'faceTemplateEdit';

        const card = this.cardLayerCards[face][object] = new Card();
        const newState = {...widget.state};
        newState.activeFace = face;
        this.renderWidget(card, newState, objectDiv);
        const removeObjects = function(card, object) {
          for(const objectDOM of $a(`.active.cardFace .cardFaceObject:nth-child(n+${+object+2})`, card.domElement))
            objectDOM.remove();
        };
        removeObjects(card, object);
        const propsDiv = document.createElement('div');
        propsDiv.className = 'faceTemplateProperty';
        for(const prop in faceTemplates[face].objects[object]) {
          const input = this.addInput(prop, faceTemplates[face].objects[object][prop], propsDiv);
          if(input)
            input.onkeyup = e=>this.faceObjectInputValueUpdated(deck, face, object, prop, input.value, card, removeObjects);
        }
        objectDiv.appendChild(propsDiv);
        this.moduleDOM.appendChild(objectDiv);
      }
    }

    const applyButton = document.createElement('button');
    applyButton.innerText = 'Apply changes';
    applyButton.onclick = e=>this.applyFaceTemplateChanges(deck);
    this.moduleDOM.appendChild(applyButton);
  }

  renderWidget(widget, state, target) {
    delete state.id;
    delete state.x;
    delete state.y;
    delete state.rotation;
    delete state.scale;
    delete state.parent;

    widget.applyInitialDelta(state);
    target.appendChild(widget.domElement);
    if(widget instanceof Card)
      widget.deck.removeCard(widget);
  }

  renderModule(target) {
    target.innerText = 'Properties module not implemented yet.';
  }
}
