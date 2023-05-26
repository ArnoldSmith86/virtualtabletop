class AssetsModule extends SidebarModule {
  constructor() {
    super('image', 'Assets', 'Edit the assets used in your game.');
  }

  async button_downloadCloudAssets(e) {
    $('#downloadCloudAssetsButton').disabled = true;

    for(const div of Object.values(this.urlDIVs))
      div.classList.add('queued');

    for(const [ url, div ] of Object.entries(this.urlDIVs)) {
      div.classList.remove('queued');
      div.classList.add('processing');
      const asset = await this.externalLinkToAsset(url);
      for(const id of this.urlMap[url])
        await this.replaceLinkInWidget(id, url, asset);
      $('span', div).innerText = asset;
      div.classList.remove('processing');
      div.classList.add('done');
    }
  }

  async externalLinkToAsset(link) {
    const response = await fetch('asset/' + encodeURIComponent(link), {
      method: 'PUT'
    });
    return await response.text();
  }

  renderModule(target) {
    this.urlMap = {};
    this.urlDIVs = {};
    for(const widget of widgets.values()) {
      for(const url of JSON.stringify(widget.state).match(/http[^'") ]+/g) || []) {
        if(!this.urlMap[url])
          this.urlMap[url] = [];
        this.urlMap[url].push(widget.get('id'));
      }
    }
    this.addSubHeader('Asset links');
    const links = div(target, 'links');
    for(const [ url, ids ] of Object.entries(this.urlMap)) {
      this.urlDIVs[url] = div(links, 'externalLink', `
        <img src="${url}"><span>${url}</span>
      `);
    }
    div(target, 'buttonBar', `
      <button icon=cloud_download id=downloadCloudAssetsButton>Turn links into assets</button>
    `);
    $('#downloadCloudAssetsButton').onclick = e=>this.button_downloadCloudAssets(e);
  }

  async replaceLinkInWidget(widgetID, oldLink, newLink) {
    const widget = widgets.get(widgetID);
    for(const propertyName in widget.state) {
      const property = JSON.stringify(widget.get(propertyName));
      if(property.includes(oldLink))
        await widget.set(propertyName, JSON.parse(property.replaceAll(regexEscape(oldLink), newLink)));
    }
  }
}
