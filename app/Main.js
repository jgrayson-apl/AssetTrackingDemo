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
  "esri/layers/StreamLayer",
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
            IdentityManager, Evented, watchUtils, promiseUtils, Portal,
            Layer, CSVLayer, FeatureLayer, StreamLayer, Extent,
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
        { type: "Wheelchair", color: Color.named.dodgerblue },
        { type: "Mobile X-Ray", color: Color.named.purple },
        { type: "Code Cart", color: Color.named.orange },
        { type: "IV Pole", color: Color.named.limegreen },
        { type: "Security Guard", color: Color.named.red }
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
            ],
            verticalOffset: {
              screenLength: 60,
              maxWorldLength: 250,
              minWorldLength: 10
            },
            callout: {
              type: "line",
              size: 0.5,
              color: Color.named.silver
            }
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
                size: "11pt",
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


      const trackingLayer = new StreamLayer({
        url: "https://geoxc2-ge.bd.esri.com:6443/arcgis/rest/services/HospitalAssets-stream-service-out/StreamServer",
        title: "Hospital Assets",
        outFields: ["*"],
        //maximumTrackPoints: 25,
        //popupTemplate: { content: "{assetType}: {routeName} @ {alongMinutes} of {totalTime}" },
        labelsVisible: true,
        labelingInfo: assetLabelingInfo.concat(movingAssetLabelingInfo),
        renderer: assetsRenderer
      });
      trackingLayer.load().then(() => {

        trackingLayer.fields.forEach(field => {
          if(field.name === "assetType"){
            field.alias = "Critical Assets";
          }
        });
        view.map.add(trackingLayer);

        const legendPanel = domConstruct.create("div", { className: "panel panel-dark panel-no-padding" });
        const legend = new Legend({ container: domConstruct.create("div", {}, legendPanel), view: view, layerInfos: [{ layer: trackingLayer }] });
        view.ui.add(legendPanel, "top-right");

        const loadingLabel = dom.byId("loading-label");
        const playPauseBtn = dom.byId("play-pause-btn");

        //
        // http://mgeorge-lx/demo/incidents.html
        //
        view.whenLayerView(trackingLayer).then(trackingLayerView => {

          // trackingLayerView.on("data-received", evt => {
          //   console.info(evt);
          // });

          loadingLabel.innerHTML = "Loading asset details...";
          this.initializeSceneSpin(view).then(() => {
            domClass.add(loadingLabel, "hide");
            domClass.remove(playPauseBtn, "hide");

            on(playPauseBtn, "click", () => {
              domClass.toggle(playPauseBtn, "icon-ui-pause icon-ui-play");
              if(domClass.contains(playPauseBtn, "icon-ui-pause")){
                this.enableSpin(true);
              } else {
                this.enableSpin(false);
              }
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

        resolve();
      });
    }

  });
});
