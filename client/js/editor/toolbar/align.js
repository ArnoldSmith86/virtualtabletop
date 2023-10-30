class AlignToLeftButton extends ToolbarButton {
  constructor(icon, name, tooltip, hotkey) {
    super(icon || 'align_horizontal_left', name || 'Align to left', tooltip || 'Align the selected widgets to the left.', hotkey !== undefined ? hotkey : 'ArrowLeft');
    this.setMinimumSelection(2);
  }

  async align(property, lowerBound, upperBound, factor) {
    const rects = selectedWidgets.map(w=>w.domElement.getBoundingClientRect());
    const target = Math.min(...rects.map(r=>r[lowerBound])) + (Math.max(...rects.map(r=>r[upperBound])) - Math.min(...rects.map(r=>r[lowerBound]))) * factor;
    for(const widget of selectedWidgets) {
      const r = widget.domElement.getBoundingClientRect();
      await widget.set(property, Math.round(widget.get(property) - (r[lowerBound]+(r[upperBound] - r[lowerBound]) * factor - target)/getScale()));
    }
  }

  async distribute(property, lowerBound, upperBound) {
    const rects = selectedWidgets.map(w=>w.domElement.getBoundingClientRect());

    const selectionLowerBound = Math.min(...rects.map(r=>r[lowerBound]));
    const totalSize = Math.max(...rects.map(r=>r[upperBound])) - selectionLowerBound;
    const widgetSize = rects.map(r=>r[upperBound]-r[lowerBound]).reduce((a,b)=>a+b);
    const gapSize = (totalSize - widgetSize) / (selectedWidgets.length - 1)

    let value = 0;
    for(const widget of [...selectedWidgets].sort((a,b)=>a.domElement.getBoundingClientRect()[lowerBound]-b.domElement.getBoundingClientRect()[lowerBound])) {
      const r = widget.domElement.getBoundingClientRect();
      await widget.set(property, Math.round(widget.get(property)-(r[lowerBound]-selectionLowerBound-value)/getScale()));
      value += gapSize + r[upperBound] - r[lowerBound];
    }
  }

  async click() {
    await this.align('x', 'left', 'right', 0);
  }
}

class AlignToCenterButton extends AlignToLeftButton {
  constructor() {
    super('align_horizontal_center', 'Align to center', 'Align the selected widgets to the center.', false);
  }

  async click() {
    await this.align('x', 'left', 'right', 0.5);
  }
}

class AlignToRightButton extends AlignToLeftButton {
  constructor() {
    super('align_horizontal_right', 'Align to right', 'Align the selected widgets to the right.', 'ArrowRight');
  }

  async click() {
    await this.align('x', 'left', 'right', 1);
  }
}

class AlignToTopButton extends AlignToLeftButton {
  constructor() {
    super('align_vertical_top', 'Align to top', 'Align the selected widgets to the top.', 'ArrowUp');
  }

  async click() {
    await this.align('y', 'top', 'bottom', 0);
  }
}

class AlignToMiddleButton extends AlignToLeftButton {
  constructor() {
    super('align_vertical_center', 'Align to middle', 'Align the selected widgets to the middle.', false);
  }

  async click() {
    await this.align('y', 'top', 'bottom', 0.5);
  }
}

class AlignToBottomButton extends AlignToLeftButton {
  constructor() {
    super('align_vertical_bottom', 'Align to bottom', 'Align the selected widgets to the bottom.', 'ArrowDown');
  }

  async click() {
    await this.align('y', 'top', 'bottom', 1);
  }
}

class HorizontalDistributeButton extends AlignToLeftButton {
  constructor() {
    super('horizontal_distribute', 'Equalize horizontal spacing', 'Equalize the spacing between the selected widgets horizontally.', 'h');
    this.setMinimumSelection(3);
  }

  async click() {
    await this.distribute('x', 'left', 'right');
  }
}

class VerticalDistributeButton extends AlignToLeftButton {
  constructor() {
    super('vertical_distribute', 'Equalize vertical spacing', 'Equalize the spacing between the selected widgets vertically.', 'v');
    this.setMinimumSelection(3);
  }

  async click() {
    await this.distribute('y', 'top', 'bottom');
  }
}

class LayerOrderButton extends AlignToLeftButton {
  constructor() {
    super('auto_awesome_motion', 'Align layering', 'Change the layering of the selected widgets so that the bottom and right most widgets are on top.', 'z');
  }

  async click() {
    const sortedWidgets = [...selectedWidgets].sort(function(a,b) {
      const  vertical =  a.domElement.getBoundingClientRect().top  - b.domElement.getBoundingClientRect().top;
      return vertical || a.domElement.getBoundingClientRect().left - b.domElement.getBoundingClientRect().left;
    });

    const zs = [...new Set(sortedWidgets.map(w=>w.get('z')).sort((a,b)=>a-b))];
    while(zs.length < sortedWidgets.length)
      zs.push(Math.max(...zs) + 1);

    for(const key in sortedWidgets)
      await sortedWidgets[key].set('z', zs[key]);
  }
}
