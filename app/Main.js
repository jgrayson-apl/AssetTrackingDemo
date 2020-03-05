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
  "esri/layers/StreamLayer",
  "esri/geometry/Extent",
  "esri/geometry/geometryEngine",
  "esri/Graphic",
  "esri/symbols/support/symbolUtils",
  "esri/widgets/Home"
], function(calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
            Color, colors, number, date, locale, on, query, dom, domClass, domConstruct,
            IdentityManager, Evented, watchUtils, promiseUtils, Portal,
            Layer, StreamLayer, Extent, geometryEngine, Graphic, symbolUtils, Home){

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
      return this.initializeUserSignIn().catch(console.warn).then(() => {

        // POPUP DOCKING OPTIONS //
        view.popup.dockEnabled = true;
        view.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "top-center"
        };

        // HOME //
        const home = new Home({ view: view });
        view.ui.add(home, { position: "top-left", index: 0 });

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
    initializeUserSignIn: function(){

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn).catch(userSignOut).then();
      };
      IdentityManager.on("credential-create", checkSignInStatus);

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
        }).catch(console.warn).then();
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({});
        this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).catch(console.warn).then();

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
        { type: "IV Pump", color: Color.named.limegreen },
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
        url: "https://geoxc2-ge.bd.esri.com/server/rest/services/HospitalAssets-stream-service-out/StreamServer",
        title: "Hospital Assets",
        outFields: ["*"],
        screenSizePerspectiveEnabled: true,
        //popupTemplate: { content: "{assetType}: {routeName} @ {alongMinutes} of {totalTime}" },
        labelsVisible: true,
        labelingInfo: assetLabelingInfo.concat(movingAssetLabelingInfo),
        renderer: {
                type: "unique-value",
                field: "assetType",
                uniqueValueInfos: assetTypes.map(assetType => {
                  return {
                    value: assetType.type,
                    symbol: getLocationSymbol(assetType.color)
                  };
                })
              }
      });
      trackingLayer.load().then(() => {
        //console.info(trackingLayer.fields.map(f => f.name));

        // ASSET TYPE FIELD //
        trackingLayer.fields.forEach(field => {
          if(field.name === "assetType"){
            field.alias = "Critical Assets";
          }
        });
        // ADD LAYER TO MAP //
        view.map.add(trackingLayer);

        // UPDATE INTERVAL //
        this.updateInterval_ms = 3000;

        // WHEN LAYERVIEW IS READY //
        view.whenLayerView(trackingLayer).then(trackingLayerView => {
          //trackingLayerView.on("data-received", dataEvt => {});

          watchUtils.whenFalseOnce(trackingLayerView, "updating", () => {

            const optionsPanel = document.getElementById("options-panel");
            view.ui.add(optionsPanel, "top-right");
            optionsPanel.classList.remove("hide");

            // COUNTS BY TYPE //
            this.initializeCountsByType(view, trackingLayerView, assetTypes);

            // LOCATION COUNTS
            this.initializeLocationCount(view, trackingLayerView);

            // FLOOR SELECTOR //
            this.initializeFloorSelector(view, trackingLayerView);

            const loadingLabel = document.getElementById("loading-label");
            loadingLabel.classList.add("hide");

          });
        });
      });

    },

    /**
     *
     * @param view
     * @param trackingLayerView
     */
    initializeFloorSelector: function(view, trackingLayerView){

      const campusLayerTitles = ["Walls", "Doors", "Units"];
      const campusLayers = view.map.layers.filter(layer => campusLayerTitles.includes(layer.title));

      query("#floor-selector input").on("change", evt => {

        const floorId = query("#floor-selector input:checked")[0].id;
        const floorNumber = (floorId === "floor-all") ? null : Number(floorId.split("-")[1]);

        trackingLayerView.filter = floorNumber ? { where: `LEVEL_NUMBER = ${floorNumber}` } : null;

        campusLayers.forEach(layer => {
          view.whenLayerView(layer).then(layerView => {
            layerView.filter = {
              where: floorNumber ? `level_number = ${floorNumber}` : null
            };
          });
        });

        this.updateLocationCount();
        this.updateCountsByType();

      });
    },

    /**
     *
     * @param view
     * @param trackingLayerView
     * @param assetTypes
     */
    initializeCountsByType: function(view, trackingLayerView, assetTypes){

      const countsNode = document.getElementById("counts-node");

      const countNodeByAssetType = assetTypes.reduce((list, assetType) => {
        const assetTypeNode = domConstruct.create("div", { className: "asset-type-node font-size-0" }, countsNode);

        const symbolNode = domConstruct.create("div", { className: "symbol-node" }, assetTypeNode);
        const assetSymbol = trackingLayerView.layer.renderer.getSymbol(new Graphic({ attributes: { assetType: assetType.type } }));
        symbolUtils.renderPreviewHTML(assetSymbol, { node: symbolNode, size: 16 });

        const labelNode = domConstruct.create("div", { className: "asset-label padding-left-half", innerHTML: assetType.type }, assetTypeNode);
        const countNode = domConstruct.create("div", { className: "count-node text-right", innerHTML: "0" }, assetTypeNode);

        return list.set(assetType.type, countNode);
      }, new Map());

      let getLatestHandle;
      this.updateCountsByType = () => {

        const latestQuery = trackingLayerView.filter ? trackingLayerView.filter.createQuery() : trackingLayerView.createQuery();
        latestQuery.set({
          groupByFieldsForStatistics: ["assetType"],
          outStatistics: [{ statisticType: "count", onStatisticField: "assetType", outStatisticFieldName: "assetCount" }]
        });

        getLatestHandle = trackingLayerView.queryLatestObservations(latestQuery).then(latestFS => {
          latestFS.features.forEach(feature => {
            countNodeByAssetType.get(feature.attributes.assetType).innerHTML = feature.attributes.assetCount;
          });
        });

      };

      this.updateCountsByType();
      setInterval(() => { requestAnimationFrame(this.updateCountsByType); }, this.updateInterval_ms);

    },

    /**
     *
     * @param view
     * @param trackingLayerView
     */
    initializeLocationCount: function(view, trackingLayerView){

      const buildingSelect = document.getElementById("building-select");
      const buildingList = document.getElementById("building-list");
      const buildingCount = document.getElementById("building-count");

      const buildingsLayer = view.map.layers.find(layer => {
        return (layer.title === "Buildings");
      });
      if(buildingsLayer){
        buildingsLayer.load().then(() => {
          buildingsLayer.outFields = ["*"];

          view.whenLayerView(buildingsLayer).then(buildingsLayerView => {
            watchUtils.whenFalseOnce(buildingsLayerView, "updating", () => {

              const buildingsQuery = buildingsLayerView.createQuery();
              buildingsQuery.set({ orderByFields: ["NAME ASC"], outFields: ["NAME"] });
              buildingsLayerView.queryFeatures(buildingsQuery).then(buildingsFS => {
                const buildingFeatures = buildingsFS.features;
                const buildingGeometries = buildingFeatures.map(f => geometryEngine.simplify(f.geometry));
                const buildingsGeometry = geometryEngine.union(buildingGeometries);

                const searchInfos = new Map();
                searchInfos.set("anywhere", {});
                searchInfos.set("buildings", { geometry: buildingsGeometry, spatialRelationship: "intersects" });
                searchInfos.set("outside", { geometry: buildingsGeometry, spatialRelationship: "disjoint" });

                buildingFeatures.forEach(buildingFeature => {
                  searchInfos.set(buildingFeature.attributes.NAME, { geometry: buildingFeature.geometry, spatialRelationship: "intersects" });
                  domConstruct.create("option", { innerHTML: buildingFeature.attributes.NAME, value: buildingFeature.attributes.NAME }, buildingList);
                });

                this.updateLocationCount = () => {
                  const searchInfo = searchInfos.get(buildingSelect.value);

                  const locationQuery = trackingLayerView.filter ? trackingLayerView.filter.createQuery() : trackingLayerView.createQuery();
                  locationQuery.set(searchInfo);

                  trackingLayerView.queryFeatureCount(locationQuery).then(count => {
                    buildingCount.innerHTML = count;
                  });

                };

                this.updateLocationCount();
                setInterval(() => { requestAnimationFrame(this.updateLocationCount); }, this.updateInterval_ms);
                buildingSelect.addEventListener("change", this.updateLocationCount);

              });
            });
          });
        });
      }
    }

  });
});

