// The Chrome-devtools-like editor for a css-like value: one collapsible section
// per class/selector, each of them a list of "property: value" rows (or a
// textarea for the values the rows cannot represent).
//
// It knows nothing about widgets: the value it edits is read and written
// through the accessors it is given, so the widget properties panel (css,
// faceCSS, handleCSS, …) and the deck editor (the css of the card defaults, of
// a face, of a card type and of a face object) share one implementation.

// The part of the editing state that is deliberately NOT in the game: the
// declarations switched off with their checkbox, the ones that have a name but
// no value yet, the sections switched to text editing and which row the next
// render should put the caret in. It lives as long as the thing being edited
// stays selected.
class CssEditorState {
  constructor() {
    this.textModes = new Set();
    this.disabledDeclarations = new Map();
    this.pendingDeclarations = new Map();
    this.pendingFocus = null;
    // collapsed/expanded per class section, so a rebuild keeps the fold
    this.collapsed = {};
  }

  // switched off and half typed declarations only live as long as their widget
  // (or deck object) is being edited - they are not in the game state, so
  // nothing may outlive it
  clear() {
    this.disabledDeclarations.clear();
    this.pendingDeclarations.clear();
    this.pendingFocus = null;
  }

  forget(stateKey) {
    this.disabledDeclarations.delete(stateKey);
    this.pendingDeclarations.delete(stateKey);
  }
}

class CssEditor {
  // options:
  //   property             the property name, shown as the title and used to
  //                        label the "default" section
  //   stateKey             unique prefix for the per-section editing state
  //   state                a CssEditorState (shared by all editors of one panel)
  //   getValue / setValue  the value being edited, in its own (unresolved) form
  //   onChanged            called after a write, to re-render whatever shows it
  //   allowClasses         whether class/selector sections can be added (the
  //                        engine only reads the nested form in some places)
  //   interpolates         whether ${PROPERTY ...} is valid in a value here
  //   showTitle            the property name above the sections
  //   titleInfo            html for the info button next to that title
  //   defaultLabel         header of the section for the value itself
  //   defaultInfo          html for the info button of that header
  //   classSuggestions / selectorSuggestions / propertySuggestions
  //   listen(rebuild)      register an outside listener that rebuilds the editor
  constructor(options) {
    this.options = options;
    this.property = options.property;
    this.key = options.stateKey || options.property;
    this.state = options.state || new CssEditorState();
    this.interpolates = options.interpolates !== undefined ? options.interpolates : this.property == 'css';
  }

  value() {
    return this.options.getValue();
  }

  writeValue(value) {
    this.options.setValue(value);
    if(typeof this.options.onChanged == 'function')
      this.options.onChanged();
  }

  render(target) {
    const classSuggestions = this.options.classSuggestions || [];
    const wrap = div(target, 'cssEditor');
    if(this.options.showTitle) {
      const title = div(wrap, 'propertyPickerSectionTitle');
      title.textContent = this.property;
      if(this.options.titleInfo)
        propertyInfoButton(title, this.options.titleInfo);
    }
    const container = div(wrap);

    const renderClassSection = (className, classValue, wholeProperty) => {
      const section = div(container, 'cssClassSection');
      const stateKey = `${this.key}:${className}`;
      // the "default" class is the widget itself (or, for the css properties
      // of a sub-element, that element) - show a friendlier label
      const displayName = className == 'default' ? (this.options.defaultLabel || cssPropertyTargets[this.property] || 'Base widget') : className;
      collapsibleSection(section, displayName, false, body => {
        // text the declaration rows cannot split without losing data (data
        // URIs and the like) stays a textarea, and so does a section the user
        // switched to text mode
        if(this.state.textModes.has(stateKey) || (typeof classValue === 'string' && classValue.trim() && !cssStringRoundTrips(classValue)))
          this.renderTextarea(className, wholeProperty, classValue, body, rebuild);
        else
          this.renderDeclarationList(className, wholeProperty, body, rebuild);
      }, this.state.collapsed, stateKey);

      if(className == 'default' && this.options.defaultInfo)
        propertyInfoButton($('.collapsibleHeader', section), this.options.defaultInfo);

      if(!wholeProperty) {
        const header = $('.collapsibleHeader', section);
        const deleteButton = document.createElement('button');
        deleteButton.setAttribute('icon', 'delete');
        deleteButton.title = `Remove ${className}`;
        deleteButton.style.marginLeft = 'auto';
        deleteButton.style.minWidth = '26px';
        deleteButton.style.padding = '0';
        deleteButton.onclick = e => {
          e.stopPropagation();
          const css = this.value();
          const newCss = isObjectLike(css) ? Object.assign({}, css) : {};
          delete newCss[className];
          const keys = Object.keys(newCss);
          // unwrap the nested form when only the default class remains
          const newValue = keys.length == 0 ? null : (keys.length == 1 && keys[0] == 'default' ? newCss.default : newCss);
          // the switched off and half typed declarations of this section go
          // with it - adding the same selector again would otherwise start out
          // with their ghosts
          this.state.forget(stateKey);
          this.writeValue(typeof newValue === 'string' && newValue.trim() === '' ? null : newValue);
          rebuild();
        };
        header.appendChild(deleteButton);
      }
    };

    const addClass = className => {
      const value = this.value();
      const isSet = value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');
      let newCss;
      if(hasNestedCSSClasses(value)) {
        if(value[className] !== undefined)
          return false;
        newCss = Object.assign({}, value, { [className]: {} });
      } else {
        newCss = { [className]: {} };
        if(isSet && className != 'default') {
          // convert the previous value into the default class of the nested form
          if(isObjectLike(value))
            newCss.default = value;
          else
            newCss.default = cssStringRoundTrips(String(value)) ? cssStringToObject(String(value)) : value;
        }
      }
      this.writeValue(newCss);
      rebuild();
    };

    const rebuild = () => {
      container.innerHTML = '';
      const value = this.value();
      if(hasNestedCSSClasses(value)) {
        for(const [ className, classValue ] of Object.entries(value))
          renderClassSection(className, classValue, false);
      } else {
        renderClassSection('default', value, true);
      }

      if(this.options.allowClasses === false)
        return;

      // dropdown (datalist) of common + per-type selectors, minus the ones
      // already present, so the field has a picker but still allows free text
      const isPresent = selector => hasNestedCSSClasses(value) && value[selector] !== undefined;
      const dropdownSuggestions = [ ...new Set([ ...commonCssSelectors, ...(this.options.selectorSuggestions || []), ...classSuggestions ]) ]
        .filter(selector => !isPresent(selector));

      suggestionAddRow(container, 'cssAddClassRow', {
        placeholder: 'new class/selector, e.g. ":hover"',
        title: 'Add a class/selector section',
        suggestions: dropdownSuggestions,
        onAdd: addClass
      });
    };

    rebuild();
    if(typeof this.options.listen == 'function')
      this.options.listen(() => {
        if(!container.contains(document.activeElement))
          rebuild();
      });
    return wrap;
  }

  // The declarations of one class/selector as plain text: the fallback for
  // values the rows cannot represent, and a way to rewrite or paste a whole
  // block at once.
  renderTextarea(className, wholeProperty, classValue, target, rebuild) {
    const stateKey = `${this.key}:${className}`;
    const textarea = document.createElement('textarea');
    textarea.value = cssTextFromValue(classValue);
    textarea.placeholder = 'property: value;';
    textarea.oninput = () => {
      const text = textarea.value;
      if(wholeProperty) {
        this.writeValue(text.trim() === '' ? null : text);
      } else {
        // class values have to be objects so the engine (and this editor)
        // recognizes the nested form; refuse text the declaration parser
        // would destroy (e.g. data URIs)
        if(text.trim() && !cssStringRoundTrips(text)) {
          textarea.classList.add('inputError');
          return;
        }
        textarea.classList.remove('inputError');
        const css = this.value();
        const newCss = isObjectLike(css) ? Object.assign({}, css) : {};
        newCss[className] = cssStringToObject(text);
        this.writeValue(newCss);
      }
    };
    target.appendChild(textarea);

    const footer = div(target, 'cssDeclarationFooter');
    if(this.state.textModes.has(stateKey)) {
      const list = document.createElement('button');
      list.setAttribute('icon', 'format_list_bulleted');
      list.textContent = 'Edit as a list';
      list.title = 'Back to one row per declaration';
      list.onclick = _=>{
        this.state.textModes.delete(stateKey);
        rebuild();
      };
      footer.appendChild(list);
    } else {
      div(footer, 'cssDeclarationNote', 'This contains a value that cannot be split into rows, so it is edited as text.');
    }
  }

  // The declarations of one class/selector as devtools-like rows: a checkbox
  // that turns a declaration off without losing it, the property name and the
  // value with completion for both, a swatch for colors and a marker for what
  // the browser does not understand.
  renderDeclarationList(className, wholeProperty, target, rebuild) {
    const stateKey = `${this.key}:${className}`;
    const classValueOf = _=>{
      const value = this.value();
      return wholeProperty ? value : (isObjectLike(value) ? value[className] : undefined);
    };

    const writeClassValue = newValue => {
      if(wholeProperty) {
        this.writeValue(newValue);
      } else {
        const css = this.value();
        const newCss = isObjectLike(css) ? Object.assign({}, css) : {};
        newCss[className] = isObjectLike(newValue) ? newValue : cssStringToObject(String(newValue || ''));
        this.writeValue(newCss);
      }
    };

    const declarations = cssDeclarationsWithDisabled(cssDeclarationList(classValueOf()), this.state.disabledDeclarations.get(stateKey), this.state.pendingDeclarations.get(stateKey));

    const isEmptyValue = declaration=>String(declaration.value === null || declaration.value === undefined ? '' : declaration.value).trim() === '';
    const remember = (map, filter)=>{
      const kept = declarations
        .map((declaration, index)=>({ name: declaration.name, value: declaration.value, index, disabled: declaration.disabled }))
        .filter(filter);
      if(kept.length)
        map.set(stateKey, kept.map(({ name, value, index })=>({ name, value, index })));
      else
        map.delete(stateKey);
    };

    const commit = _=>{
      remember(this.state.disabledDeclarations, declaration=>declaration.disabled);
      // a declaration without a value is invalid css, so a row that only has
      // its name yet is kept here instead of writing "font-size: ;" into the
      // game state - it becomes real as soon as it has a value
      remember(this.state.pendingDeclarations, declaration=>!declaration.disabled && String(declaration.name).trim() !== '' && isEmptyValue(declaration));
      writeClassValue(cssValueFromDeclarations(declarations.filter(declaration=>!declaration.disabled && !isEmptyValue(declaration)), classValueOf()));
    };

    const propertyNames = this.options.propertySuggestions || commonCssProperties;
    const nameListID = editorDomID('cssProperties');
    const nameList = document.createElement('datalist');
    nameList.id = nameListID;
    for(const suggestion of propertyNames) {
      const option = document.createElement('option');
      option.value = suggestion;
      nameList.appendChild(option);
    }
    target.appendChild(nameList);

    let addRow = null;
    // a css value cannot hold the same property twice, so a name that is
    // already in the list continues in the row that has it
    const rowByName = new Map();
    const list = div(target, 'cssDeclarationList');
    declarations.forEach((declaration, index) => {
      const row = div(list, `cssDeclarationRow${declaration.disabled ? ' disabled' : ''}`);

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'cssDeclarationToggle';
      toggle.checked = !declaration.disabled;
      toggle.title = 'Turn this declaration off. It stays in this list while the widget is selected.';
      toggle.onchange = _=>{
        declaration.disabled = !toggle.checked;
        commit();
        rebuild();
      };
      row.appendChild(toggle);

      const name = document.createElement('input');
      name.className = 'cssDeclarationName';
      name.value = declaration.name;
      name.placeholder = 'property';
      name.setAttribute('list', nameListID);
      row.appendChild(name);

      div(row, 'cssDeclarationColon', ':');

      const value = document.createElement('input');
      value.className = 'cssDeclarationValue';
      value.value = declaration.value;
      value.placeholder = 'value';
      // the value suggestions depend on the property name, so they are built
      // for the row that is actually being edited instead of for all of them
      value.onfocus = _=>{
        const suggestions = cssValueSuggestions(declaration.name);
        if(value.getAttribute('list') || !suggestions.length)
          return;
        const valueList = document.createElement('datalist');
        valueList.id = editorDomID('cssValues');
        for(const suggestion of suggestions) {
          const option = document.createElement('option');
          option.value = suggestion;
          valueList.appendChild(option);
        }
        row.appendChild(valueList);
        value.setAttribute('list', valueList.id);
      };

      const warning = document.createElement('span');
      warning.className = 'cssDeclarationWarning material-symbols';
      warning.textContent = 'warning';
      warning.title = 'The browser does not understand this declaration, so it has no effect.';
      const markValidity = _=>{
        const valid = cssDeclarationIsValid(declaration.name, declaration.value, this.interpolates);
        row.classList.toggle('invalidDeclaration', !valid);
        warning.style.display = valid ? 'none' : '';
      };
      markValidity();

      if(!declaration.disabled)
        rowByName.set(String(declaration.name).trim(), value);

      // committing the name per keystroke would write every prefix of it into
      // the game state, so it waits for Enter or leaving the field
      name.onchange = _=>{
        const newName = name.value.trim();
        // renaming onto another row would silently drop that row's value
        if(newName && newName != String(declaration.name).trim() && rowByName.has(newName)) {
          alert(`This section already sets "${newName}".`);
          name.value = declaration.name;
          return;
        }
        rowByName.delete(String(declaration.name).trim());
        declaration.name = name.value;
        rowByName.set(newName, value);
        markValidity();
        commit();
      };
      name.onkeydown = event=>{
        if(event.key == 'Enter')
          value.focus();
      };
      // a pasted block of declarations is split up instead of becoming one
      // unusable property name, like it would be in devtools
      name.onpaste = event=>{
        // only intercept a paste that replaces the whole field - inserting at
        // a caret position (e.g. clicking at the end of "font-size" and
        // pasting "border: 1px solid black") used to always blow this row
        // away and replace it with the pasted one, silently dropping
        // whatever this row had with no way to tell it happened
        if(name.selectionStart != 0 || name.selectionEnd != name.value.length)
          return;
        const pastedText = (event.clipboardData || window.clipboardData).getData('text');
        if(!pastedText || !pastedText.includes(':'))
          return;
        const pasted = cssDeclarationList(pastedText);
        if(!pasted.length)
          return;
        event.preventDefault();
        // a css value cannot hold the same property twice, so a pasted
        // declaration another row already has updates that row instead of
        // becoming a duplicate that cssValueFromDeclarations would drop
        const added = [];
        for(const entry of pasted) {
          const entryName = String(entry.name).trim();
          const existing = declarations.find((declaration, position)=>position != index && !declaration.disabled && String(declaration.name).trim() == entryName)
            || added.find(declaration=>String(declaration.name).trim() == entryName);
          if(existing)
            existing.value = entry.value;
          else
            added.push({ name: entry.name, value: entry.value, disabled: false });
        }
        // nothing new means the paste only updated other rows - keep this one
        declarations.splice(index, added.length ? 1 : 0, ...added);
        this.state.pendingFocus = `${stateKey}:${pasted[pasted.length-1].name}`;
        commit();
        rebuild();
      };
      value.oninput = _=>{
        declaration.value = value.value;
        markValidity();
        commit();
      };
      // Enter moves on to the next declaration, like devtools does
      value.onkeydown = event=>{
        if(event.key == 'Enter' && addRow)
          $('input', addRow).focus();
      };

      // the swatch slot is reserved on every row, colour or not - only some
      // declarations show one, and letting the rest skip it entirely shifted
      // their value column out of line with the ones that do (devtools keeps
      // this column fixed regardless of the property).
      if(cssValueIsColor(declaration.value)) {
        const hasAlpha = cssColorHasAlpha(declaration.value);
        const hex = hasAlpha ? null : cssColorHexValue(declaration.value);
        if(hex === null) {
          // an <input type="color"> is a plain opaque hex: it has no alpha
          // channel and knows no modern color space, so it would silently
          // flatten those values - this one only shows what is set
          const swatch = div(row, 'cssDeclarationSwatch readOnly');
          swatch.style.backgroundImage = `linear-gradient(${declaration.value}, ${declaration.value})`;
          swatch.title = `${declaration.value} - ${hasAlpha ? 'colors with transparency are' : 'this color is'} edited in the value field`;
        } else {
          const swatch = document.createElement('input');
          swatch.type = 'color';
          swatch.className = 'cssDeclarationSwatch';
          swatch.value = hex;
          swatch.title = declaration.value;
          swatch.oninput = _=>{
            declaration.value = swatch.value;
            value.value = swatch.value;
            commit();
          };
          row.appendChild(swatch);
        }
      } else {
        div(row, 'cssDeclarationSwatch placeholder');
      }

      row.appendChild(value);
      row.appendChild(warning);

      const remove = document.createElement('button');
      remove.setAttribute('icon', 'delete');
      remove.title = `Remove ${declaration.name || 'this declaration'}`;
      remove.onclick = _=>{
        declarations.splice(index, 1);
        commit();
        rebuild();
      };
      row.appendChild(remove);

      if(this.state.pendingFocus == `${stateKey}:${declaration.name}`) {
        this.state.pendingFocus = null;
        setTimeout(_=>value.focus(), 0);
      }
    });

    addRow = suggestionAddRow(target, 'cssDeclarationAddRow', {
      placeholder: 'property, e.g. "font-size"',
      title: 'Add a declaration',
      suggestions: propertyNames.filter(suggestion=>!declarations.some(declaration=>declaration.name == suggestion)),
      onAdd: text => {
        const added = text.includes(':') ? cssDeclarationList(text) : [ { name: text, value: '' } ];
        if(!added.length)
          return false;
        // a property that is already in the list is not added a second time -
        // it would overwrite the existing row without saying so
        let focusName = null;
        for(const entry of added) {
          // a disabled row for the same name still counts as "already in the
          // list" - skipping it here used to push a second, enabled row with
          // the same name, which cssDeclarationsWithDisabled then collapsed
          // back down to just the disabled one on the next rebuild, so "Add"
          // appeared to silently do nothing
          const existing = declarations.find(declaration=>String(declaration.name).trim() == String(entry.name).trim());
          if(existing) {
            existing.disabled = false;
            if(entry.value)
              existing.value = entry.value;
          } else {
            declarations.push({ name: entry.name, value: entry.value, disabled: false });
          }
          if(focusName === null)
            focusName = entry.name;
        }
        // the name is set, so continue in the value of that row
        this.state.pendingFocus = `${stateKey}:${focusName}`;
        commit();
        rebuild();
      }
    });
    addRow.classList.add('cssAddClassRow');

    const footer = div(target, 'cssDeclarationFooter');
    const text = document.createElement('button');
    text.setAttribute('icon', 'edit_note');
    text.textContent = 'Edit as text';
    text.title = 'Edit all declarations of this section in one text field';
    text.onclick = _=>{
      this.state.textModes.add(stateKey);
      rebuild();
    };
    footer.appendChild(text);
  }
}
