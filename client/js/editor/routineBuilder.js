// Renders one routine of one widget as a list of plain language step cards.
// The sentences, verbs and clauses come from routineTemplates.js; this file only
// turns them into DOM and writes the edited routine array back through the same
// path the rest of the Edit Widgets module uses.
//
// Everything is live-write: each change replaces the whole routine array with a
// single delta, so the Undo module handles undo for free and an open JSON editor
// stays in sync.

class RoutineBuilder {
  constructor(module, widget, property, target) {
    this.module = module;
    this.widget = widget;
    this.property = property;
    this.list = div(target, 'routineStepList');
    this.footer = div(target, 'routineBuilderFooter');
    this.renderAddStep();
    this.renderSteps();

    this.module.addPropertyListener(widget, property, _=>{
      if(!this.list.contains(document.activeElement))
        this.renderSteps();
    });
  }

  routine() {
    const value = this.widget.get(this.property);
    return Array.isArray(value) ? value : [];
  }

  // A deep copy so untouched steps are written back exactly as they were read.
  editableRoutine() {
    return JSON.parse(JSON.stringify(this.routine()));
  }

  save(routine) {
    this.module.inputValueUpdated(this.widget, this.property, routine);
  }

  // mutate gets the copy of the step at index; the routine is saved afterwards.
  updateStep(index, mutate, rerender=false) {
    const routine = this.editableRoutine();
    mutate(routine[index], routine);
    this.save(routine);
    if(rerender)
      this.renderSteps();
  }

  moveStep(index, offset) {
    const routine = this.editableRoutine();
    routine.splice(index + offset, 0, routine.splice(index, 1)[0]);
    this.save(routine);
    this.renderSteps();
  }

  removeStep(index) {
    const routine = this.editableRoutine();
    routine.splice(index, 1);
    this.save(routine);
    this.renderSteps();
  }

  addStep(func) {
    const routine = this.editableRoutine();
    routine.push(routineBuilderNewOperation(func));
    this.save(routine);
    this.renderSteps();
  }

  renderSteps() {
    this.list.innerHTML = '';
    const routine = this.routine();
    if(!routine.length)
      div(this.list, 'routineEmpty', html(routineBuilderText('ui.emptyRoutine')));
    routine.forEach((operation, index)=>this.renderStep(operation, index, routine));
  }

  renderStep(operation, index, routine) {
    const card = div(this.list, 'routineStep');
    const header = div(card, 'routineStepHeader');
    div(header, 'routineStepIndex', html(index + 1));

    const match = routineBuilderMatch(operation);
    const title = div(header, 'routineStepTitle');
    if(match)
      title.textContent = routineBuilderText(`op.${operation.func}`);
    else if(typeof operation === 'string')
      title.textContent = operation.trim().startsWith('//') ? 'Note' : 'Expression';
    else
      title.textContent = (operation && operation.func) || 'Step';

    const controls = div(header, 'routineStepControls');
    this.addIconButton(controls, 'arrow_upward', routineBuilderText('ui.moveUp'), _=>this.moveStep(index, -1), index == 0);
    this.addIconButton(controls, 'arrow_downward', routineBuilderText('ui.moveDown'), _=>this.moveStep(index, 1), index == routine.length - 1);
    this.addIconButton(controls, 'delete', routineBuilderText('ui.removeStep'), _=>this.removeStep(index));

    if(match)
      this.renderSupportedStep(card, operation, index, match);
    else
      this.renderAdvancedStep(card, operation, index);
  }

  renderSupportedStep(card, operation, index, match) {
    const { template, variant } = match;
    const popouts = document.createElement('div');
    popouts.className = 'routineStepPopouts';

    if(template.variants.length > 1) {
      const verb = document.createElement('select');
      verb.className = 'routineVerb';
      for(const candidate of template.variants) {
        const option = document.createElement('option');
        option.value = candidate.id;
        option.textContent = routineBuilderText(`verb.${operation.func}.${candidate.id}`);
        verb.appendChild(option);
      }
      verb.value = variant.id;
      verb.onchange = _=>this.updateStep(index, step=>{
        template.variants.find(candidate=>candidate.id == verb.value).apply(step);
      }, true);
      card.appendChild(verb);
    }

    const sentence = div(card, 'routineSentence');
    this.renderSentence(sentence, popouts, routineBuilderText(`variant.${operation.func}.${variant.id}`), variant.fields, operation, index);

    const clauses = routineBuilderVariantClauses(template, variant);
    for(const clause of clauses) {
      if(!routineBuilderClauseIsSet(clause, operation))
        continue;
      const row = div(card, 'routineClause');
      const text = div(row, 'routineSentence');
      this.renderSentence(text, popouts, routineBuilderText(`clause.${operation.func}.${clause.id}`), routineBuilderClauseFields(clause), operation, index);
      this.addIconButton(div(row, 'routineClauseControls'), 'close', routineBuilderText('ui.optionRemove'), _=>this.updateStep(index, step=>{
        if(clause.remove)
          clause.remove(step);
        else
          for(const key of routineBuilderClauseKeys(clause))
            delete step[key];
      }, true));
    }

    this.renderNote(card, operation, index);

    const unset = clauses.filter(clause=>!routineBuilderClauseIsSet(clause, operation));
    const options = unset.map(clause=>({
      value: clause.id,
      label: routineBuilderText(`clause.${operation.func}.${clause.id}`).replace(/\{[^}]+\}/g, '...')
    }));
    if(operation.comment === undefined && operation.note === undefined)
      options.push({ value: '__note', label: routineBuilderText('ui.noteAdd') });
    if(!options.length)
      return card.appendChild(popouts);

    const add = document.createElement('select');
    add.className = 'routineAddClause';
    add.innerHTML = `<option value="">+ ${html(routineBuilderText('ui.optionAdd'))}</option>` + options.map(option=>`<option value="${html(option.value)}">${html(option.label)}</option>`).join('');
    add.onchange = _=>{
      const chosen = add.value;
      add.value = '';
      if(!chosen)
        return;
      this.updateStep(index, step=>{
        if(chosen == '__note') {
          step.comment = '';
          return;
        }
        const clause = unset.find(candidate=>candidate.id == chosen);
        if(clause.add)
          clause.add(step);
        else
          for(const field of routineBuilderClauseFields(clause))
            step[field.key] = routineBuilderFieldValue(field, step);
      }, true);
    };
    card.appendChild(add);
    card.appendChild(popouts);
  }

  renderNote(card, operation, index) {
    const key = operation.note !== undefined ? 'note' : 'comment';
    if(operation[key] === undefined)
      return;
    const row = div(card, 'routineClause routineNote');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'routineNoteInput';
    input.placeholder = routineBuilderText('ui.notePlaceholder');
    input.value = operation[key];
    input.oninput = _=>this.updateStep(index, step=>{ step[key] = input.value; });
    row.appendChild(input);
    this.addIconButton(div(row, 'routineClauseControls'), 'close', routineBuilderText('ui.optionRemove'), _=>this.updateStep(index, step=>{ delete step[key]; }, true));
  }

  renderAdvancedStep(card, operation, index) {
    if(typeof operation === 'string' && operation.trim().startsWith('//')) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'routineNoteInput';
      input.value = operation.replace(/^\s*\/\/\s?/, '');
      input.oninput = _=>this.updateStep(index, (_step, routine)=>{ routine[index] = `// ${input.value}`; });
      card.appendChild(input);
      return;
    }

    const body = div(card, 'routineAdvanced');
    div(body, 'routineAdvancedHint', html(routineBuilderText('ui.unsupported')));
    const code = document.createElement('pre');
    code.className = 'routineAdvancedJSON';
    code.textContent = JSON.stringify(operation, null, 2);
    body.appendChild(code);
    const jump = document.createElement('button');
    jump.setAttribute('icon', 'data_object');
    jump.textContent = routineBuilderText('ui.editInJSON');
    jump.onclick = _=>routineBuilderOpenJSONEditor();
    body.appendChild(jump);
  }

  // Splits "Move {count} from {from} to {to}" into text and chips.
  renderSentence(target, popouts, sentence, fields, operation, index) {
    for(const part of sentence.split(/(\{[a-zA-Z]+\})/)) {
      if(!part)
        continue;
      const placeholder = part.match(/^\{([a-zA-Z]+)\}$/);
      if(!placeholder) {
        const text = document.createElement('span');
        text.textContent = part;
        target.appendChild(text);
        continue;
      }
      const field = fields.find(candidate=>candidate.name == placeholder[1]);
      if(field)
        this.renderField(target, popouts, field, operation, index);
    }
  }

  renderField(target, popouts, field, operation, index) {
    const chip = div(target, 'routineChip');
    const write = (key, value)=>this.updateStep(index, step=>{
      if(value === undefined)
        delete step[key];
      else
        step[key] = value;
    });

    if(field.kind == 'holderOrPick' || field.kind == 'labelOrPick')
      return this.renderDualField(chip, popouts, field, operation, index);
    if(field.kind == 'widget')
      return this.renderWidgetField(chip, popouts, field, operation, index);
    if(field.kind == 'pick')
      return this.renderPickField(chip, routineBuilderFieldValue(field, operation), index, value=>write(field.key, value));
    if(field.kind == 'value')
      return this.renderValueField(chip, field, operation, index);
    if(field.kind == 'enum')
      return this.renderEnumField(chip, field, operation, index);
    if(field.kind == 'widgetType')
      return this.renderWidgetTypeField(chip, field, operation, index);
    if(field.kind == 'countOrAll')
      return this.renderCountField(chip, field, operation, index);

    const input = document.createElement('input');
    input.type = field.kind == 'number' ? 'number' : 'text';
    input.className = 'routineTextInput';
    if(field.kind == 'property')
      input.setAttribute('list', routineBuilderPropertyDatalist());
    const value = routineBuilderFieldValue(field, operation);
    input.value = value === undefined || value === null ? '' : value;
    input.oninput = _=>write(field.key, field.kind == 'number' ? +input.value || 0 : input.value);
    chip.appendChild(input);
  }

  renderWidgetField(chip, popouts, field, operation, index) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'routineTextInput';
    const current = _=>{
      const value = routineBuilderFieldValue(field, operation);
      return typeof value === 'string' ? value : '';
    };
    input.value = current();
    input.oninput = _=>this.updateStep(index, step=>{ step[field.key] = input.value; });
    chip.appendChild(input);

    const popoutControls = this.module.renderWidgetSelectPopout(chip, this.widget, {
      title: routineBuilderText('ui.pickWidget'),
      pickerKey: `routine:${this.property}:${index}:${field.key}`,
      typeFilter: field.typeFilter || '',
      getSelectedIDs: _=>current() ? [ current() ] : [],
      apply: widgetID=>this.updateStep(index, step=>{ step[field.key] = widgetID; }, true)
    });
    popouts.appendChild(popoutControls.popout);
  }

  // widgetOptionLabel adds an entry that switches the chip over to a single
  // widget instead of a group (see renderDualField).
  renderPickField(chip, value, index, apply, widgetOptionLabel) {
    const select = document.createElement('select');
    select.className = 'routineSelect';
    const names = routineBuilderCollections(this.routine(), index);
    if(value != ROUTINE_SINGLE_WIDGET && names.indexOf(value) == -1)
      names.push(value);
    for(const name of names) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name == 'DEFAULT' ? routineBuilderText('pick.default') : routineBuilderText('pick.named', { name });
      select.appendChild(option);
    }
    const custom = document.createElement('option');
    custom.value = '__custom';
    custom.textContent = routineBuilderText('pick.custom');
    select.appendChild(custom);
    if(widgetOptionLabel) {
      const single = document.createElement('option');
      single.value = ROUTINE_SINGLE_WIDGET;
      single.textContent = widgetOptionLabel;
      select.appendChild(single);
    }
    select.value = value;
    select.onchange = _=>{
      if(select.value != '__custom')
        return apply(select.value);
      const name = prompt(routineBuilderText('pick.customPrompt'), value);
      select.value = value;
      if(name)
        apply(name);
    };
    chip.appendChild(select);
  }

  // LABEL / FLIP / SHUFFLE take either a widget ID or a collection name, so one
  // chip offers both and the sentence stays the same.
  renderDualField(chip, popouts, field, operation, index) {
    const keys = routineBuilderDualKeys[field.kind];
    const usesWidget = operation[keys.id] !== undefined;

    this.renderPickField(chip, usesWidget ? ROUTINE_SINGLE_WIDGET : (operation[keys.collection] || 'DEFAULT'), index, value=>this.updateStep(index, step=>{
      if(value == ROUTINE_SINGLE_WIDGET) {
        delete step[keys.collection];
        step[keys.id] = '';
      } else {
        delete step[keys.id];
        step[keys.collection] = value;
      }
    }, true), routineBuilderText(keys.idLabel));

    if(usesWidget)
      this.renderWidgetField(chip, popouts, { key: keys.id, kind: 'widget', typeFilter: keys.typeFilter }, operation, index);
  }

  // Literal value or one of the values an earlier step remembered. Anything
  // else (a full ${...} expression) keeps working as typed text.
  renderValueField(chip, field, operation, index) {
    const value = routineBuilderFieldValue(field, operation);
    const variables = routineBuilderVariables(this.routine(), index);
    const asVariable = typeof value === 'string' && value.match(/^\$\{([^}]+)\}$/);
    const currentVariable = asVariable && variables.indexOf(asVariable[1]) != -1 ? asVariable[1] : '';

    const select = document.createElement('select');
    select.className = 'routineSelect';
    select.innerHTML = `<option value="">${html(routineBuilderText('ui.useValue'))}</option>` +
      variables.map(name=>`<option value="${html(name)}">${html(routineBuilderText('ui.valueOfVariable', { name }))}</option>`).join('');
    select.value = currentVariable;
    select.onchange = _=>this.updateStep(index, step=>{
      step[field.key] = select.value ? `\${${select.value}}` : '';
    }, true);
    if(variables.length)
      chip.appendChild(select);

    if(currentVariable)
      return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'routineTextInput';
    input.value = value === undefined || value === null ? '' : value;
    input.oninput = _=>this.updateStep(index, step=>{ step[field.key] = propertyInputNumberOrText(input.value); });
    chip.appendChild(input);
  }

  renderEnumField(chip, field, operation, index) {
    const select = document.createElement('select');
    select.className = 'routineSelect';
    for(const value of field.values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = routineBuilderText(`enum.${operation.func}.${field.key}.${value}`);
      select.appendChild(option);
    }
    select.value = routineBuilderFieldValue(field, operation);
    select.onchange = _=>this.updateStep(index, step=>{ step[field.key] = select.value; });
    chip.appendChild(select);
  }

  renderWidgetTypeField(chip, field, operation, index) {
    const select = document.createElement('select');
    select.className = 'routineSelect';
    for(const type of routineBuilderWidgetTypes) {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type == 'all' ? 'all' : (editorTypeNames[type] || type).toLowerCase();
      select.appendChild(option);
    }
    const value = routineBuilderFieldValue(field, operation);
    if(routineBuilderWidgetTypes.indexOf(value) == -1) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    select.value = value;
    select.onchange = _=>this.updateStep(index, step=>{ step[field.key] = select.value; });
    chip.appendChild(select);
  }

  // Accepts a number or the word "all". Legacy routines store 0 for "all".
  renderCountField(chip, field, operation, index) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'routineTextInput routineCountInput';
    const value = routineBuilderFieldValue(field, operation);
    input.value = value === 0 || value === 'all' ? 'all' : value;
    input.oninput = _=>this.updateStep(index, step=>{
      step[field.key] = /^\s*all\s*$/i.test(input.value) ? 'all' : (+input.value || 0);
    });
    chip.appendChild(input);
  }

  renderAddStep() {
    const select = document.createElement('select');
    select.className = 'routineAddStep';
    let options = `<option value="">+ ${html(routineBuilderText('ui.addStep'))}</option>`;
    for(const category of routineBuilderCategories)
      options += `<optgroup label="${html(routineBuilderText(`category.${category.id}`))}">` +
        category.funcs.map(func=>`<option value="${func}">${html(routineBuilderText(`op.${func}`))}</option>`).join('') + '</optgroup>';
    select.innerHTML = options;
    select.onchange = _=>{
      const func = select.value;
      select.value = '';
      if(func)
        this.addStep(func);
    };
    this.footer.appendChild(select);
  }

  addIconButton(target, icon, title, onclick, disabled=false) {
    const button = document.createElement('button');
    button.setAttribute('icon', icon);
    button.title = title;
    button.disabled = disabled;
    button.onclick = onclick;
    target.appendChild(button);
    return button;
  }
}

function routineBuilderOpenJSONEditor() {
  const jsonModuleButton = $('#editorSidebar button[icon=data_object]');
  if(jsonModuleButton)
    jsonModuleButton.click();
}

const ROUTINE_SINGLE_WIDGET = '__widget';

// One shared datalist with the property names actually used in this room, so
// the property chips suggest instead of demanding spelling knowledge.
function routineBuilderPropertyDatalist() {
  const id = 'routineBuilderProperties';
  let datalist = $(`#${id}`);
  if(!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = id;
    document.body.appendChild(datalist);
  }
  const names = new Set();
  for(const widget of widgets.values())
    for(const property in widget.state)
      if(!property.match(/^_/))
        names.add(property);
  datalist.innerHTML = [...names].sort().map(name=>`<option value="${html(name)}">`).join('');
  return id;
}
