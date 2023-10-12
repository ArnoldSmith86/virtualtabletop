function getAssetKeysRecursive(obj, widgetId, widgetType, currentKeys = []) {
    const matches = [];
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value == 'object' && value != null) {
            matches.push(...getAssetKeysRecursive(value, widgetId, widgetType, currentKeys.concat(key)));
        }
        if (typeof value == 'string') {
          for(const match of value.matchAll(/\/assets\/-?[0-9]+_[0-9]+/g)) {
            matches.push({
                widget: widgetId,
                type: widgetType,
                keys: currentKeys.concat(key),
                asset: match[0]
            });
          }
        }
    }
    return matches;
}

function getAllAssets() {
    const assets = [];
    for (const [id, widget] of widgets) {
        const widgetType = widget.get('type') || 'basic';
        assets.push(...getAssetKeysRecursive(widget.state, id, widgetType));
    }
    return assets;
}

function getAllAssetsGrouped() {
    const assets = {};
    for (const asset of getAllAssets()) {
      if(!assets[asset.asset])
        assets[asset.asset] = { asset: asset.asset, uses: [] };
      assets[asset.asset].uses.push(asset);
    }
    return assets;
}

function getAssetTargetSize(asset, originalWidth, originalHeight) {
    let targetWidth = 0;
    let targetHeight = 0;

    for (const use of asset.uses) {
        if(use.type == 'deck') {
            const deck = widgets.get(use.widget);

            let key = null;
            let objects = [];
            if(use.keys.length == 3 && use.keys[0] == 'cardTypes')
                key = use.keys[2];
            if(use.keys.length == 2 && use.keys[0] == 'cardDefaults')
                key = use.keys[1];
            if(use.keys.length == 5 && use.keys[0] == 'faceTemplates' && use.keys[4] == 'value')
                objects = [ [ use.keys[1], use.keys[3] ] ];

            if(key)
                for(const [ t, template ] of Object.entries(deck.get('faceTemplates')))
                    for(const [ o, faceObject ] of Object.entries(template.objects))
                        if(faceObject.dynamicProperties && faceObject.dynamicProperties.value == key)
                            objects.push([ t, o ]);

            for(const [ face, object ] of objects) {
                const targetFace   = deck.get('faceTemplates')[face];
                const cardDefaults = deck.get('cardDefaults');
                const targetObject = targetFace.objects[object];
                const enlarge      = targetFace.properties && targetFace.properties.enlarge || cardDefaults && cardDefaults.enlarge || 1;
                targetWidth  = Math.max(targetWidth,  targetObject.width  * enlarge || originalWidth);
                targetHeight = Math.max(targetHeight, targetObject.height * enlarge || originalHeight);
            }
        } else {
            const targetWidget = widgets.get(use.widget);
            if(targetWidget) {
                targetWidth  = Math.max(targetWidth,  targetWidget.get('width')  * (targetWidget.get('enlarge') || 1));
                targetHeight = Math.max(targetHeight, targetWidget.get('height') * (targetWidget.get('enlarge') || 1));
            } else {
                targetWidth  = Math.max(targetWidth,  originalWidth);
                targetHeight = Math.max(targetHeight, originalHeight);
            }
        }
    }

    // Calculate safe width and height
    const safeWidth = Math.min(targetWidth * 2, originalWidth);
    const safeHeight = Math.min(targetHeight * 2, originalHeight);

    // Calculate the aspect ratio of the original size
    const originalAspectRatio = originalWidth / originalHeight;

    // Adjust dimensions based on the original aspect ratio
    if (safeWidth / safeHeight > originalAspectRatio) {
        // Adjust the height based on the width
        return [Math.round(safeWidth), Math.round(safeWidth / originalAspectRatio)];
    } else {
        // Adjust the width based on the height
        return [Math.round(safeHeight * originalAspectRatio), Math.round(safeHeight)];
    }
}

class AssetsModule extends SidebarModule {
  constructor() {
    super('image', 'Assets', 'Edit the assets used in your game.');
  }

  async button_assetDownload(usePropertyFilenames) {
      loadJSZip();

      await waitForJSZip();
      const zip = new JSZip();
      const assets = getAllAssets();

      for (const assetObj of assets) {
          const blob = await (await fetch(assetObj.asset.substr(1))).blob();
          const assetFileName = usePropertyFilenames ? `${assetObj.type} ${assetObj.widget} - ${assetObj.keys.join(' - ')}` : `asset ${assetObj.asset.match(/[^\/]+$/)[0]}`;
          zip.file(assetFileName + '.' + blob.type.match(/[^\/]+$/)[0].replace(/\+xml/, '').replace(/octet-stream/, 'bin'), blob);
      }

      var url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      var link = document.createElement("a");
      link.href = url;
      link.download = 'assets.zip';
      document.body.appendChild(link); // Required for Firefox
      link.click();
      setTimeout(function () {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
      }, 100);
  }

  button_assetUpload() {
    uploadAsset(async function(newAsset, filename) {
      const tokens = filename.replace(/\.[^.]+$/, '').match(/^([^ ]+) (.*)$/);
      if(tokens) {
        batchStart();
        setDeltaCause(`${getPlayerDetails().playerName} replaced assets in editor`);
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

  button_compressAssets() {
    const table = document.createElement('table');
    const headerRow = table.insertRow();
    ['Original', /*'JPG',*/ 'WebP', 'PNG'].forEach(col => {
      const th = document.createElement('th');
      th.textContent = col;
      headerRow.appendChild(th);
    });

    Object.values(getAllAssetsGrouped()).forEach(asset => {
      const row = table.insertRow();

      const processImage = (checkbox) => {
        // Extract sizes from the DOM
        const sizesFromDOM = Array.from(row.querySelectorAll('span')) // adjust the selector accordingly
                                  .map(label => parseFloat(label.textContent.split(' ')[2]));

        // Get the original size
        const originalSize = sizesFromDOM[0];

        // Filter sizes which are more than 10% smaller than the original size
        const qualifyingSizes = sizesFromDOM.filter(size => size < originalSize * 0.9);

        // If there are any qualifying sizes, get the index of the smallest qualifying size
        const minSizeIdx = qualifyingSizes.length ? sizesFromDOM.indexOf(Math.min(...qualifyingSizes)) : -1;

        // Check only the checkbox corresponding to the smallest qualifying size and uncheck others in the row
        Array.from(row.cells).forEach((cell, idx) => {
            const cellCheckbox = cell.querySelector('input[type="checkbox"]');
            if (cellCheckbox) {
                cellCheckbox.checked = idx === minSizeIdx;
            }
        });
      };

      const createOriginalCell = (isSVG, asset, blob) => {
        const cell = row.insertCell();
        const img = new Image();
        const sizeLabel = document.createElement('span');

        sizeLabel.textContent = `${asset.asset} (${blob.type})`;
        img.onload = function() {
          const sizeInKB = (blob.size / 1024).toFixed(2);
          if (isSVG) {
            sizeLabel.textContent = `SVG: ${sizeInKB} KB`;
          } else {
            sizeLabel.textContent = `${blob.type.replace(/image\//, '').toUpperCase()} (${img.naturalWidth}x${img.naturalHeight}): ${sizeInKB} KB`;
          }
        };
        img.src = URL.createObjectURL(blob);

        cell.appendChild(img);
        cell.appendChild(sizeLabel);
      };

      fetch(asset.asset.substr(1))
        .then(res => res.blob())
        .then(blob => {
          if (blob.type === "image/svg+xml" || !blob.type.match(/^image/)) {
            createOriginalCell(true, asset, blob);
          } else {
            createOriginalCell(false, asset, blob);
            const targets = [/*'jpeg',*/ 'webp' ];
            if(blob.type != 'image/jpeg')
              targets.push('png');

            targets.forEach((format, idx) => {
              const cell = row.insertCell();
              const checkbox = document.createElement('input');
              checkbox.type = 'checkbox';
              const img = new Image();
              const sizeLabel = document.createElement('span');

              img.onload = async function() {
                img.onload = null;
                const [targetWidth, targetHeight] = getAssetTargetSize(asset, img.naturalWidth, img.naturalHeight);
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                const compressedDataUrl = canvas.toDataURL(`image/${format}`, 0.7);
                const res = await fetch(compressedDataUrl);
                const blob = await res.blob();
                const sizeInKB = (blob.size / 1024).toFixed(2);

                const formatString = format === 'original' ? 'Original' : format.toUpperCase();
                sizeLabel.textContent = `${formatString} (${targetWidth}x${targetHeight}): ${sizeInKB} KB`;

                processImage(checkbox);

                img.src = compressedDataUrl;
                img.dataset.sourceAsset = asset.asset;
              };
              img.onerror = _=>img.remove();
              img.src = URL.createObjectURL(blob);

              cell.appendChild(checkbox);
              cell.appendChild(img);
              cell.appendChild(sizeLabel);
            });
          }
        });
    });

    for(const oldContainer of $a('.compressAssetsContainer'))
      oldContainer.remove();

    const compressDiv = div(this.moduleDOM, 'compressAssetsContainer', `
      <h2>Compress Assets</h2>
      <p>Beside compression, asset dimensions will also be reduced <b>based on their widget sizes</b> (and enlarge value).</p>
      <p>This does not take everything into consideration so check the results.</p>
      <p>For compressing <b>SVGs</b>, we recommend using <a href="https://vecta.io/nano">vecta.io</a>. For most SVGs, you can even set the precision to 1 which makes the compression a bit lossy. Just use the asset download and upload buttons above.</p>
    `)
    compressDiv.appendChild(table);

    div(compressDiv, 'buttonBar', `
      <button icon=checkmark id=executeCompressionButton>Replace selected images</button>
    `);
    $('#executeCompressionButton').onclick = e=>this.button_compressAssetsExecute();
  }

  async button_compressAssetsExecute() {
    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} compressed assets in editor`);
    const assets = getAllAssetsGrouped();
    for(const checkbox of $a('input[type=checkbox]', this.moduleDOM)) {
      if(checkbox.checked) {
        const img = $('img', checkbox.parentNode)
        await this.replaceAsset(assets[img.dataset.sourceAsset], await _uploadAsset(img.src));
      }
    }
    batchEnd();
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

  onStateReceivedWhileActive(delta) {
    for(const oldContainer of $a('.compressAssetsContainer'))
      oldContainer.remove();
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
      <button icon=compress id=compressAssetsButton>Compress assets</button>
    `);
    $('#downloadAllAssetsButton').onclick = e=>this.button_assetDownload(false);
    $('#downloadAllAssetsByPropertyButton').onclick = e=>this.button_assetDownload(true);
    $('#uploadAllAssetsButton').onclick = e=>this.button_assetUpload();
    $('#compressAssetsButton').onclick = e => this.button_compressAssets();
  }

  async replaceAsset(asset, newAsset) {
    for(const use of asset.uses) {
      const property = widgets.get(use.widget).get(use.keys[0]);
      const newValue = JSON.parse(JSON.stringify(property).replaceAll(asset.asset, newAsset));
      await widgets.get(use.widget).set(use.keys[0], newValue);
    }
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
