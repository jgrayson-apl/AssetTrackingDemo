/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/number",
  "dojo/date",
  "dojo/date/locale",
  "dojo/on",
  "dojo/query",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "esri/identity/IdentityManager",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/layers/Layer",
  "esri/layers/CSVLayer",
  "esri/layers/FeatureLayer",
  "esri/geometry/Extent",
  "esri/Graphic",
  "esri/widgets/Home",
  "esri/widgets/TimeSlider",
  "esri/widgets/Search",
  "esri/widgets/LayerList",
  "esri/widgets/Legend",
  "esri/widgets/BasemapGallery",
  "esri/widgets/Expand"
], function(calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
            Color, colors, number, date, locale, on, query, dom, domClass, domConstruct,
            IdentityManager, Evented, watchUtils, promiseUtils, Portal, Layer, CSVLayer, FeatureLayer, Extent,
            Graphic, Home, TimeSlider, Search, LayerList, Legend, BasemapGallery, Expand){

  return declare([Evented], {

    /**
     *
     */
    constructor: function(){
      // BASE //
      this.base = null;
      // CALCITE WEB //
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function(base){
      if(!base){
        console.error("ApplicationBase is not defined");
        return;
      }
      this.base = base;

      domHelper.setPageLocale(this.base.locale);
      domHelper.setPageDirection(this.base.direction);

      const webMapItems = this.base.results.webMapItems;
      const webSceneItems = this.base.results.webSceneItems;
      const validItems = webMapItems.concat(webSceneItems).map(response => {
        return response.value;
      });
      const firstItem = (validItems && validItems.length) ? validItems[0] : null;
      if(!firstItem){
        console.error("Could not load an item to display");
        return;
      }

      this.base.config.title = (this.base.config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(this.base.config.title);

      const viewProperties = itemUtils.getConfigViewProperties(this.base.config);
      viewProperties.container = "view-container";
      viewProperties.ui = { components: ["compass"] };

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({ item: firstItem, appProxies: appProxies }).then(map => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then(view => {
          view.when(() => {
            this.viewReady(this.base.config, firstItem, view).then(() => {
              /* ... */
            });
          });
        });
      });
    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function(config, item, view){

      // TITLE //
      dom.byId("app-title-node").innerHTML = config.title;

      // USER SIGN IN //
      return this.initializeUserSignIn(view).always(() => {

        // POPUP DOCKING OPTIONS //
        view.popup.dockEnabled = true;
        view.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "top-center"
        };

        watchUtils.whenFalseOnce(view, "updating", () => {
          // APPLICATION READY //
          this.applicationReady(view);
        });

      });

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function(view){

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn);
      };
      IdentityManager.on("credential-create", checkSignInStatus);
      IdentityManager.on("credential-destroy", checkSignInStatus);

      // SIGN IN NODE //
      const signInNode = dom.byId("sign-in-node");
      const userNode = dom.byId("user-node");

      // UPDATE UI //
      const updateSignInUI = () => {
        if(this.base.portal.user){
          dom.byId("user-firstname-node").innerHTML = this.base.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.base.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.base.portal.user.username;
          dom.byId("user-thumb-node").src = this.base.portal.user.thumbnailUrl;
          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        } else {
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");
        }
        return promiseUtils.resolve();
      };

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
        return this.base.portal.load().then(() => {
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({});
        this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);

      };

      // USER SIGN IN //
      on(signInNode, "click", userSignIn);

      // SIGN OUT NODE //
      const signOutNode = dom.byId("sign-out-node");
      if(signOutNode){
        on(signOutNode, "click", userSignOut);
      }

      return checkSignInStatus();
    },


    /**
     * APPLICATION READY
     *
     * @param view
     */
    applicationReady: function(view){

      const assetTypes = [
        { type: "Wheelchair", withinBuilding: false, travelMode: "Wheelchair", stops: 3, count: 6, default: 6, color: Color.named.dodgerblue },
        { type: "Mobile X-Ray", withinBuilding: true, travelMode: "Wheelchair", stops: 2, count: 2, default: 2, color: Color.named.purple },
        { type: "Code Cart", withinBuilding: true, travelMode: "Wheelchair", stops: 2, count: 2, default: 2, color: Color.named.orange },
        { type: "IV Pole", withinBuilding: true, travelMode: "Walking", stops: 2, count: 2, default: 2, color: Color.named.limegreen },
        { type: "Security Guard", withinBuilding: false, travelMode: "Walking", stops: 4, count: 10, default: 6, color: Color.named.red }
      ];

      const symbolSize = 0.5;

      const getLocationSymbol = (assetColor) => {
        return {
          type: "point-3d",
          symbolLayers: [
            {
              type: "object",
              anchor: "relative",
              anchorPosition: { x: 0, y: 0, z: -(symbolSize * 2.0) },
              castShadows: true,
              width: symbolSize,
              depth: symbolSize,
              height: symbolSize * 2.0,
              resource: { primitive: "cylinder" },
              material: { color: assetColor }
            }
          ]
        }
      };

      const assetsRenderer = {
        type: "unique-value",
        field: "assetType",
        uniqueValueInfos: assetTypes.map(assetType => {
          return {
            value: assetType.type,
            symbol: getLocationSymbol(assetType.color)
          };
        })
      };

      const createAssetLabels = (assetType) => {
        return {
          where: `(assetType = '${assetType.type}') AND (alongMinutes = 0.0)`,
          labelExpressionInfo: {
            expression: `$feature.assetType`
          },
          labelPlacement: "above-center",
          symbol: {
            type: "label-3d",
            symbolLayers: [
              {
                type: "text",
                size: "8pt",
                material: { color: Color.named.white },
                halo: { color: Color.named.gray, size: 1.5 }
              }
            ]/*,
            verticalOffset: {
              screenLength: 5,
              maxWorldLength: 50,
              minWorldLength: 5
            },
            callout: {
              type: "line",
              size: 0.5,
              color: Color.named.silver
            }*/
          }
        }
      };

      const createMovingAssetLabels = (assetType) => {
        return {
          where: `(assetType = '${assetType.type}') AND (alongMinutes > 0.0)`,
          labelExpressionInfo: {
            expression: `"[" + $feature.LEVEL_NUMBER + "] " + $feature.assetType`
          },
          labelPlacement: "above-center",
          symbol: {
            type: "label-3d",
            symbolLayers: [
              {
                type: "text",
                size: "9pt",
                material: { color: assetType.color },
                halo: { color: Color.named.white, size: 2.5 }
              }
            ],
            verticalOffset: {
              screenLength: 60,
              maxWorldLength: 250,
              minWorldLength: 10
            },
            callout: {
              type: "line",
              size: 0.5,
              color: Color.named.white,
              border: { color: assetType.color }
            }
          }
        }
      };

      const assetLabelingInfo = assetTypes.map(assetType => {
        return createAssetLabels(assetType);
      });

      const movingAssetLabelingInfo = assetTypes.map(assetType => {
        return createMovingAssetLabels(assetType);
      });

      const trackingCSVLayer = new CSVLayer({
        title: "Hospital Assets",
        url: "./assets/HospitalAssets.csv",
        elevationInfo: {
          mode: "absolute-height",
          featureExpressionInfo: { expression: "$feature.z" },
          unit: "meters"
        },
        timeInfo: { startField: "startTime", endField: "endTime" },
        popupTemplate: { content: "{assetType}: {routeName} @ {alongMinutes} of {totalTime}" },
        labelsVisible: true,
        labelingInfo: assetLabelingInfo.concat(movingAssetLabelingInfo),
        renderer: assetsRenderer
      });
      trackingCSVLayer.load().then(() => {

        trackingCSVLayer.fields.forEach(field => {
          if(field.name === "assetType"){
            field.alias = "Type";
          }
        });

        const legendPanel = domConstruct.create("div", { className: "panel panel-dark panel-no-padding" });
        const legend = new Legend({ container: domConstruct.create("div", {}, legendPanel), view: view, layerInfos: [{ layer: trackingCSVLayer }] });
        view.ui.add(legendPanel, "top-right");

        const startTime = date.add(trackingCSVLayer.timeInfo.fullTimeExtent.start, "minute", 2);

        const timeSlider = new TimeSlider({
          container: "time-slider-container",
          view: view,
          mode: "instant",
          timeVisible: true,
          playRate: 500,
          loop: true,
          stops: { interval: { value: 500, unit: "milliseconds" } },
          fullTimeExtent: trackingCSVLayer.timeInfo.fullTimeExtent,
          values: [startTime]
        });
        timeSlider.next();


        const loadingLabel = dom.byId("loading-label");
        const playPauseBtn = dom.byId("play-pause-btn");

        view.map.add(trackingCSVLayer);
        view.whenLayerView(trackingCSVLayer).then(trackingCSVLayerView => {
          loadingLabel.innerHTML = "Loading asset details...";

          const displayMovingAssets = true;
          if(displayMovingAssets){

            const movingPanel = domConstruct.create("div", { className: "panel panel-dark padding-trailer-0" });
            view.ui.add(movingPanel, "bottom-left");

            timeSlider.watch("timeExtent", timeExtent => {
              trackingCSVLayerView.queryFeatures({
                where: "alongMinutes > 0.0",
                timeExtent: timeExtent,
                orderByFields: ["assetID"]
              }).then(movingFS => {

                requestAnimationFrame(() => {
                  movingPanel.innerHTML = movingFS.features.map(feature => {
                    return `<div class="moving-info-node trailer-quarter">
                              <span>${feature.attributes.assetType}</span>
                              <span class="padding-left-2 right">
                                ${feature.attributes.alongMinutes.toFixed(2).padStart(5, "0")}
                                <progress value="${feature.attributes.alongMinutes}" max="${feature.attributes.totalTime}"></progress>                        
                                ${feature.attributes.totalTime.toFixed(2).padStart(5, "0")}
                              </span>
                            </div>`;
                  }).join("");
                });

              });
            });
          }

          watchUtils.whenNotOnce(trackingCSVLayerView, "updating", () => {
            this.initializeSceneSpin(view).then(() => {

              domClass.add(loadingLabel, "hide");
              domClass.remove(playPauseBtn, "hide");

              timeSlider.play();

              on(playPauseBtn, "click", () => {
                domClass.toggle(playPauseBtn, "icon-ui-pause icon-ui-play");
                if(domClass.contains(playPauseBtn, "icon-ui-pause")){
                  //timeSlider.play();
                  this.enableSpin(true);
                } else {
                  //timeSlider.stop();
                  this.enableSpin(false);
                }
              });

            });
          });
        });
      });

    },

    /**
     *
     * @param view
     */
    initializeSceneSpin: function(view){
      return promiseUtils.create((resolve, reject) => {

        let rotating = false;
        this.enableSpin = enabled => {
          rotating = enabled;
          if(rotating){
            rotate();
          }
        };

        // view.on("click", [], clickEvt => {
        //   this.enableSpin(clickEvt.button === 0);
        // });

        // HEADING INCREMENT //
        let headingIncrement = 0.025;

        // ROTATE SCENE //
        const rotate = () => {
          if(!view.interacting){
            view.goTo({
              center: view.center,
              heading: (view.camera.heading + headingIncrement)
            }, { animate: false });
            if(rotating){
              requestAnimationFrame(rotate);
            }
          }
        };

        watchUtils.whenFalseOnce(view, "updating", () => {
          watchUtils.whenFalse(view, "interacting", rotate);
          //this.enableSpin(true);
          resolve();
        });
      });
    }

  });
});


/*
 const trackingFields = [
  {
    name: "ObjectID",
    alias: "ObjectID",
    type: "oid",
    valueType: "none"
  },
  {
    name: "longitude",
    alias: "Longitude",
    type: "double",
    valueType: "coordinate"
  },
  {
    name: "latitude",
    alias: "Latitude",
    type: "double",
    valueType: "coordinate"
  },
  {
    name: "x",
    alias: "X",
    type: "double",
    valueType: "coordinate"
  },
  {
    name: "y",
    alias: "Y",
    type: "double",
    valueType: "coordinate"
  },
  {
    name: "z",
    alias: "Z",
    type: "double",
    valueType: "coordinate"
  },
  {
    name: "assetID",
    alias: "ID",
    type: "string",
    valueType: "unique-identifier"
  },
  {
    name: "assetType",
    alias: "Type",
    type: "string",
    valueType: "type-or-category"
  },
  {
    name: "LEVEL_NUMBER",
    alias: "Floor",
    type: "integer",
    valueType: "measurement"
  },
  {
    name: "routeName",
    alias: "Route Name",
    type: "string",
    valueType: "description"
  },
  {
    name: "travelMode",
    alias: "Travel Mode",
    type: "string",
    valueType: "type-or-category"
  },
  {
    name: "alongMinutes",
    alias: "Minutes Along",
    type: "double",
    valueType: "measurement"
  },
  {
    name: "totalTime",
    alias: "Total Minutes",
    type: "double",
    valueType: "measurement"
  },
  {
    name: "startTime",
    alias: "Start Time",
    type: "date",
    valueType: "date-and-time"
  },
  {
    name: "endTime",
    alias: "End Time",
    type: "date",
    valueType: "date-and-time"
  }
];
*/


/*

const trackingLayer = new FeatureLayer({
  id: "hospital_assets",
  title: "Hospital Assets",
  fields: [
    {
      name: "ObjectID",
      alias: "ObjectID",
      type: "oid",
      valueType: "none"
    },
    {
      name: "assetID",
      alias: "ID",
      type: "string",
      valueType: "unique-identifier"
    },
    {
      name: "assetType",
      alias: "Type",
      type: "string",
      valueType: "type-or-category"
    },
    {
      name: "LEVEL_NUMBER",
      alias: "Floor",
      type: "integer",
      valueType: "measurement"
    },
    {
      name: "routeName",
      alias: "Route Name",
      type: "string",
      valueType: "description"
    },
    {
      name: "travelMode",
      alias: "Travel Mode",
      type: "string",
      valueType: "type-or-category"
    },
    {
      name: "alongMinutes",
      alias: "Minutes Along",
      type: "double",
      valueType: "measurement"
    },
    {
      name: "totalTime",
      alias: "Total Minutes",
      type: "double",
      valueType: "measurement"
    },
    {
      name: "startTime",
      alias: "Start Time",
      type: "date",
      valueType: "date-and-time"
    },
    {
      name: "endTime",
      alias: "End Time",
      type: "date",
      valueType: "date-and-time"
    }
  ],
  outFields: ["*"],
  objectIdField: "ObjectID",
  geometryType: "point",
  hasZ: true, hasM: true,
  spatialReference: { wkid: 102100 },
  source: trackingFS.features,
  timeInfo: { startField: "startTime", endField: "endTime" },
  //elevationInfo: { mode: "absolute-height", offset: symbolSize },
  popupTemplate: { content: "{assetType}: {routeName} @ {alongMinutes} of {totalTime}" },
  renderer: {
    type: "unique-value",
    field: "assetType",
    uniqueValueInfos: assetTypes.map(assetType => {
      return {
        value: assetType.type,
        symbol: getLocationSymbol(assetType.color)
      };
    })
  },
  labelsVisible: true,
  labelingInfo: [
    {
      labelExpressionInfo: {
        expression: `"[" + $feature.LEVEL_NUMBER + "] " + $feature.assetType`
      },
      symbol: {
        type: "label-3d",
        symbolLayers: [
          {
            type: "text",
            size: 11,
            material: { color: Color.named.dodgerblue },
            halo: { color: Color.named.white, size: 0.5 }
          }
        ],
        verticalOffset: {
          screenLength: 50,
          maxWorldLength: 200,
          minWorldLength: 10
        },
        callout: {
          type: "line",
          size: 1.0,
          color: Color.named.dodgerblue,
          border: { color: Color.named.silver }
        }
      }
    }
  ]
});
});
*/
