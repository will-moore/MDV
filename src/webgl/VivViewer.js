import {
  loadOmeTiff,
  DetailView,
  VolumeView,
  ColorPaletteExtension,
  ColorPalette3DExtensions,
  DETAIL_VIEW_ID,
} from '@hms-dbmi/viv';

import {hexToRGB, RGBToHex} from "../datastore/DataStore.js";
import {Deck} from '@deck.gl/core';
import { getMultiSelectionStats, getDefaultSelectionStats, getBoundingCube } from '../utilities/VivUtils.js';
import { ScatterplotLayer } from 'deck.gl';
import { getRandomString, NPOT } from '../utilities/Utilities.js';

const tiffs = new Map();
export function acceptTiffCache(oldTiffs) {
  console.log('accepting tiff cache');
  oldTiffs.forEach((tiff, key) => {
    tiffs.set(key, tiff);
  });
}
function getTiff(url) {
  if (tiffs.has(url)) {
    return tiffs.get(url);
  }
  const tiff = loadOmeTiff(url);
  tiffs.set(url, tiff);
  return tiff;
}
// if (module.hot) {
//   module.hot.accept(newModule => {
//     newModule.acceptTiffCache(tiffs);
//   });
// }


class VivViewer {
  constructor(canvas,config,initialView){
    console.log('new VivViewer', config);
    this.canvas = canvas;


    
    this.height= this.canvas.height;
    this.width= this.canvas.width;
    this.config=config;
    this.hasRequestedDefaultChannelStats = false;
    this.initClip();
    getTiff(config.url).then(loader=>{
      this.tiff = loader;
      this._setUp(loader,initialView);
    });
  }

  setSize(x,y,conf){
    this.height=y;
    this.width=x;

    const v =this.getViewState(conf.x_scale,conf.y_scale,conf.offset);
    this.canvas.width = x;
    this.canvas.height = y;
    this.canvas.style.width = x;
    this.canvas.style.height = y;
    this.deck.setProps({
      height:y,
      width:x,
      viewState:v
    })
  }


  setPanZoom(offset,x_scale,y_scale){  
    const v= this.getViewState(x_scale,y_scale,offset);
    this.deck.setProps({
      viewState:v
    })
  }

  getViewState(x_scale,y_scale,offset){
    // when rendering 3d, we want viewState to be undefined so it can use initialViewState & internal camera control
    if (this.config.use3d) return undefined;
    const hzoom = Math.log2(y_scale);
    const wzoom = Math.log2(x_scale);
    let xpos = ((1/x_scale)*(this.native_x))/2;
    xpos-= offset[0];
    let ypos = ((1/y_scale)*(this.native_y))/2;
    ypos+=this.native_y-offset[1];
    return {
      height:this.native_y,
      width:this.native_x,
      id:DETAIL_VIEW_ID,
      target:[xpos,ypos,0],
      zoom:[wzoom,hzoom]
    }
  }

  setChannel(channel){
    const channels = this.mainVivLayer.props;
    const i = channels.selections.findIndex(x=>x.id===channel.id);

    channels.colors[i]=hexToRGB(channel.color);
    channels.contrastLimits[i]=channel.contrastLimits;
    channels.channelsVisible[i]= channel.channelsVisible;
    if (channel.domains) channels.domains[i] = channel.domains;
    this.layers=[...this.layers];
    this.deck.setProps({
      layers: this.layers
    })
  }

  removeChannel(channel){
    const chs = this.mainVivLayer.props;
    const i = chs.selections.findIndex(sel=>sel.id===channel.id);
    chs.colors.splice(i,1);
    chs.selections.splice(i,1);
    chs.contrastLimits.splice(i,1);
    chs.channelsVisible.splice(i,1);
    this.createLayers(chs);
    this.deck.setProps({
      layers:[this.layers]
    });

  }

  addChannel(channel){
    const chs = this.mainVivLayer.props;
    chs.channelsVisible.push(true);
    channel.color= channel.color || "#ff00ff";
    // pjt consider using helpers (now effectively doing this indirectly).
    /// --> channel.contrastLimit was always undefined anway
    // channel.contrastLimits = channel.contrastLimit || [20,100];
    //if new channels are addded there are no default values -need to be calculated?
    channel.contrastLimits = [0,200];//this.defaultContrastLimits[channel.index].slice(0);
    channel.domains = [0,200];//this.defaultDomains[channel.index].slice(0);
    channel.channelsVisible=true;
    chs.colors.push(hexToRGB(channel.color));
    chs.contrastLimits.push(channel.contrastLimits);
    chs.domains.push(channel.domains);
    channel.id = getRandomString();
    chs.selections.push({z:0,t:0,c:channel.index,id:channel.id});
    
    this.createLayers(chs);
    this.deck.setProps({
      layers:[this.layers],
    });
    

    channel.name=this.channels[channel.index].Name;
    channel._id = chs.selections[chs.selections.length-1]._id;
    return channel;

  }

  /** equivalent to VivScatterPlot... */
  getAllChannels() {
    return this.channels;
  }
  getChannels() {
    const {props} = this.mainVivLayer;
    const names = props.selections.map(x => this.channels[x.c].Name);
    const colors = props.colors.map(RGBToHex);
    return names.map((name, i) => {
      return {
        name,
        index: props.selections[i].c,
        id: props.selections[i].id,
        color: colors[i],
        contrastLimits: props.contrastLimits[i].slice(0),
        channelsVisible: props.channelsVisible[i],
        domains: props.domains[i]
      }
    });
  }

  recenterCamera() {
    if (!this.config.use3d) return;
    console.log('recenter');
    const {SizeX, SizeY, SizeZ} = this.tiff.metadata.Pixels;
    const target = [SizeX / 2, SizeY / 2, SizeZ / 2];
    const initialViewState = {
      target,
      zoom: 1,
      rotationX: 0,
      rotationOrbit: 0 + Math.random() * 0.01
    }
    this.volViewState = initialViewState;
    this.deck.setProps({
      initialViewState
    });
  }

  _createLayers3D() {
    const tiff = this.tiff;
    //most of this can move into createLayers()
    const {SizeX, SizeY, SizeZ, Channels: channels} = tiff.metadata.Pixels;
    const target = [SizeX/2, SizeY/2, SizeZ/2];
    const id = '3d_' + DETAIL_VIEW_ID;
    const loader = tiff.data;
    const n = channels.length;
    // this is wrong in cases where non-default set of channels is used.
    // const selections = channels.map((_, i) => {return {c: i, t: 0, z: 0}});
    const dtype = tiff.data[0].dtype;
    const { domains, contrastLimits, selections, colors, channelsVisible } = this.newVivProps 
      ?? (this.mainVivLayer ? this.mainVivLayer.props : getDefaultSelectionStats(n));
    this.newVivProps = null;
    if (!this.hasRequestedDefaultChannelStats) {
      this.hasRequestedDefaultChannelStats = true;
      this.defaultDomains = domains;
      this.defaultContrastLimits = contrastLimits.slice(0);
      getMultiSelectionStats(loader, selections).then((v) => {
        this.defaultDomains = v.domains;
        this.defaultContrastLimits = v.contrastLimits.slice(0);
        this.newVivProps = { ...this.mainVivLayer.props, ...v };
        this._updateProps();
      });
    }
    const xSlice = this.getXSlice();
    const ySlice = this.getYSlice();
    const zSlice = this.getZSlice();
    const resolution = loader.length - 1; // this should change...
    const props = {
      id,
      loader,
      dtype,
      resolution,
      channelsVisible,
      contrastLimits,
      domains,
      selections,
      colors,
      xSlice, ySlice, zSlice
    };
    const volumeView = this.detailView;
    // could we setProps here instead when the layer already exists? no, don't think so - readonly.
    const layers = volumeView.getLayers({
      props, viewStates: [this.volViewState]
    });
    this.layers = layers;
    this.mainVivLayer = layers[0];
    if (this.config.scatterData) {
      // alert('scatter!');
      layers.push(new ScatterplotLayer({
        data: this.config.scatterData,//.slice(0), //do not want to clone / slice here... but mutating data doesn't work otherwise
        radiusScale: 1,
        billboard: true,
        getFillColor: this.config.getScatterFillColor
        // getFillColor: (d) => d.color || [100, 100, 100]
      }));
    }
  };

  initClip() {
    this.clipX = [0, 1];
    this.clipY = [0, 1];
    this.clipZ = [0, 1];
  }
  // so much boilerplate...
  setClipX(min, max) {
    this.clipX = [min, max];
    this._updateProps();
  }
  setClipY(min, max) {
    this.clipY = [min, max];
    this._updateProps();
  }
  setClipZ(min, max) {
    this.clipZ = [min, max];
    this._updateProps();
  }
  getXSlice() {
    const {SizeX} = this.tiff.metadata.Pixels;
    const [min, max] = this.clipX;
    // const v = NPOT(SizeX);
    const v = getBoundingCube(this.loader)[0][1];
    return [min*v, max*v];
  }
  getYSlice() {
    const {SizeY} = this.tiff.metadata.Pixels;
    const [min, max] = this.clipY;
    // const v = NPOT(SizeY);
    const v = getBoundingCube(this.loader)[1][1];
    return [min*v, max*v];
  }
  getZSlice() {
    const {SizeZ} = this.tiff.metadata.Pixels;
    const [min, max] = this.clipZ;
    // const v = NPOT(SizeZ);
    const v = getBoundingCube(this.loader)[2][1];
    return [min*v, max*v];
  }
  _updateProps() {
    this.createLayers();
    this.deck.setProps({layers: this.layers})
  }

  _setUp(loader, iv){
    this.native_x= loader.metadata.Pixels.SizeX;
    this.native_y= loader.metadata.Pixels.SizeY;
    const {use3d} = this.config;
    
    this.extensions = [new ColorPaletteExtension()];
    this.channels = loader.metadata.Pixels.Channels;
    this.loader= loader.data;
    this.transparentColor=[255,255,255,0];
    const baseViewState = this.getViewState(iv.x_scale,iv.y_scale,iv.offset);
    
    if (use3d) {
      // this._setUpVolumeView(loader);
      const { SizeX, SizeY, SizeZ } = loader.metadata.Pixels;
      const target = [SizeX / 2, SizeY / 2, SizeZ / 2];
      this.volViewState = {
        zoom: 1, target
      };
      this.detailView = new VolumeView({
        id: DETAIL_VIEW_ID,
        useFixedAxis: false,
        target,
        extensions: [new ColorPalette3DExtensions.AdditiveBlendExtension()],
      });
    } else {
      this.detailView = new DetailView({
        id: DETAIL_VIEW_ID,
        height:this.native_y,
        width:this.native_x
      });
    }
    const initialViewState = this.volViewState;
    const {image_properties} = this.config;

    const deckGLView =this.detailView.getDeckGlView();
    if (image_properties?.selections) for (let s of image_properties.selections){
      s.id=getRandomString();
    }

    this.createLayers(image_properties);
    this.deck=new Deck({
          canvas:this.canvas,
          layers:[this.layers],
          views:[deckGLView],
          viewState:baseViewState,
          width:this.width,
          height:this.height,
          useDevicePixels:false,
          initialViewState,
          controller: use3d
    });
  }

  createLayers(info){
    if (this.config.use3d) {
      this._createLayers3D();
      return;
    }
    const viewStates=  {id: DETAIL_VIEW_ID}

    //domains may not be the same as contrast limits -  again need way of calculating
    //temp default values
    const domains=info.contrastLimits.map(x=>[0,200]);
    const layerConfig = {
      loader:this.loader,
      contrastLimits:info.contrastLimits.slice(0),
      domains,
      colors:info.colors.slice(0),
      channelsVisible:info.channelsVisible.slice(0),
      selections:info.selections.slice(0),
      extensions:this.extensions,
      transparentColor:this.transparentColor
    };
    if (!this.defaultDomains) this.defaultDomains = layerConfig.contrastLimits; //PJT somewhat tested
    if (!this.defaultContrastLimits) this.defaultContrastLimits = this.defaultDomains.slice(0);
    this.layers= this.detailView.getLayers({
      viewStates,
      props:layerConfig
    });
    this.mainVivLayer = this.layers[0];
  }
}

export default VivViewer;