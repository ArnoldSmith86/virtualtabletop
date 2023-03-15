class AlignToLeftButton extends ToolbarButton {
  constructor(icon, tooltip, hotkey) {
    super(icon || 'align_horizontal_left', tooltip || 'Align the selected widgets to the left.', hotkey !== undefined ? hotkey : 'ArrowLeft');
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

  click() {
    this.align('x', 'left', 'right', 0);
  }
}

class AlignToCenterButton extends AlignToLeftButton {
  constructor() {
    super('align_horizontal_center', 'Align the selected widgets to the center.', false);
  }

  click() {
    this.align('x', 'left', 'right', 0.5);
  }
}

class AlignToRightButton extends AlignToLeftButton {
  constructor() {
    super('align_horizontal_right', 'Align the selected widgets to the right.', 'ArrowRight');
  }

  click() {
    this.align('x', 'left', 'right', 1);
  }
}

class AlignToTopButton extends AlignToLeftButton {
  constructor() {
    super('align_vertical_top', 'Align the selected widgets to the top.', 'ArrowUp');
  }

  click() {
    this.align('y', 'top', 'bottom', 0);
  }
}

class AlignToMiddleButton extends AlignToLeftButton {
  constructor() {
    super('align_vertical_center', 'Align the selected widgets to the middle.', false);
  }

  click() {
    this.align('y', 'top', 'bottom', 0.5);
  }
}

class AlignToBottomButton extends AlignToLeftButton {
  constructor() {
    super('align_vertical_bottom', 'Align the selected widgets to the bottom.', 'ArrowDown');
  }

  click() {
    this.align('y', 'top', 'bottom', 1);
  }
}

class HorizontalDistributeButton extends AlignToLeftButton {
  constructor() {
    super('horizontal_distribute', 'Equalize the spacing between the selected widgets horizontally.', 'h');
  }

  click() {
    this.distribute('x', 'left', 'right');
  }
}

class VerticalDistributeButton extends AlignToLeftButton {
  constructor() {
    super('vertical_distribute', 'Equalize the spacing between the selected widgets vertically.', 'v');
  }

  click() {
    this.distribute('y', 'top', 'bottom');
  }
}

class LayerOrderButton extends AlignToLeftButton {
  constructor() {
    super('auto_awesome_motion', 'Change the layering of the selected widgets so that the bottom and right most widgets are on top.', 'z');
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
