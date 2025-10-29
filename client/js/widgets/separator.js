class Separator extends Widget {
  constructor(object, surface) {
    super(object, surface);

    this.addDefaults({
      height: 20,
      width: 200,
      movable: false,
      layer: -3,
      typeClasses: 'widget separator',
      name: 'Separator'
    });
  }

  render(delta) {
    super.render(delta);
    if (delta.name) {
      this.domElement.textContent = this.get('name');
    }
  }

  getEditMode() {
    const editMode = super.getEditMode();
    editMode.push({
      property: 'name',
      label: 'Name',
      type: 'text'
    });
    return editMode;
  }
}