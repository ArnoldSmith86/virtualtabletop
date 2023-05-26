class AssetsModule extends SidebarModule {
  constructor() {
    super('image', 'Assets', 'Edit the assets used in your game.');
  }

  async button_assetDownload(usePropertyFilenames) {
    loadJSZip();
    function getAssetKeysRecursive(obj, keyPrefix) {
      const matches = {};
      for(const [ key, value ] of Object.entries(obj)) {
        if(typeof value == 'object' && value != null)
          Object.assign(matches, getAssetKeysRecursive(value, `${keyPrefix} - ${key}`));
        if(typeof value == 'string' && value.match(/^\/assets\/-?[0-9]+_[0-9]+$/))
          matches[`${keyPrefix} - ${key}`] = value;
      }
      return matches;
    }

    const matches = {};
    for(const [ id, widget ] of widgets)
      Object.assign(matches, getAssetKeysRecursive(widget.state, `${widget.get('type') || 'basic'} ${id}`));

    await waitForJSZip();
    const zip = new JSZip();
    let i = 0;
    for(const [ filename, asset ] of Object.entries(matches)) {
      const blob  = await (await fetch(asset.substr(1))).blob()
      zip.file((usePropertyFilenames ? filename : `asset ${asset.match(/[^\/]+$/)[0]}`) + '.' + blob.type.match(/[^\/]+$/)[0], blob);
    }

    var url = URL.createObjectURL(await zip.generateAsync({type:"blob"}));
    var link = document.createElement("a");
    link.href = url;
    link.download = 'assets.zip';
    document.body.appendChild(link); // Required for Firefox
    link.click();
    setTimeout(function(){
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  button_assetUpload() {
    uploadAsset(async function(newAsset, filename) {
      const tokens = filename.replace(/\.[^.]+$/, '').match(/^([^ ]+) (.*)$/);
      if(tokens) {
        batchStart();
        if(tokens[1] == 'asset') {
          try {
            function replaceAssetRecursive(obj, oldAsset, newAsset) {
              if(obj == oldAsset)
                return newAsset;
              if(typeof obj == 'object' && obj != null)
                for(const [ key, value ] of Object.entries(obj))
                  obj[key] = replaceAssetRecursive(value, oldAsset, newAsset);
              return obj;
            }
            const oldAsset = `/assets/${tokens[2]}`;
            if(newAsset != oldAsset) {
              for(const [ id, widget ] of widgets) {
                for(const propertyName in widget.state) {
                  const property = JSON.parse(JSON.stringify(widget.get(propertyName)));
                  await widget.set(propertyName, replaceAssetRecursive(property, oldAsset, newAsset));
                }
              }
            }
          } catch(e) {
            console.error(`Failed to update ${filename}.`);
          }
        } else {
          try {
            const keys = tokens[2].split(' - ');
            const widget = widgets.get(keys.shift());
            const propertyName = keys.shift();
            const property = JSON.parse(JSON.stringify(widget.get(propertyName)));

            if(keys.length > 0) {
              let pointer = property;
              while(keys.length > 1)
                pointer = pointer[keys.shift()];
              pointer[keys[0]] = newAsset;

              await widget.set(propertyName, property);
            } else {
              await widget.set(propertyName, newAsset);
            }
          } catch(e) {
            console.error(`Failed to update ${filename}. Please make sure the filename corresponds to a valid widget property.`);
          }
        }
        batchEnd();
      }
    });
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

    if(Object.keys(this.urlMap).length) {
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

    this.addSubHeader('Included Assets');
    div(target, 'buttonBar', `
      <p>Here you can download all the assets used in this game as a zip file so you can process them on your computer (replace/resize/...).</p>
      <button icon=cloud_download id=downloadAllAssetsButton>Download all assets</button>
      <button icon=cloud_download id=downloadAllAssetsByPropertyButton>Download all assets by property</button>
      <button icon=cloud_upload id=uploadAllAssetsButton>Upload assets in same format</button>
    `);
    $('#downloadAllAssetsButton').onclick = e=>this.button_assetDownload(false);
    $('#downloadAllAssetsByPropertyButton').onclick = e=>this.button_assetDownload(true);
    $('#uploadAllAssetsButton').onclick = e=>this.button_assetUpload();
  }

  async replaceLinkInWidget(widgetID, oldLink, newLink) {
    const widget = widgets.get(widgetID);
    for(const propertyName in widget.state) {
      const property = JSON.stringify(widget.get(propertyName));
      if(property.includes(oldLink))
        await widget.set(propertyName, JSON.parse(property.replaceAll(oldLink, newLink)));
    }
  }
}
