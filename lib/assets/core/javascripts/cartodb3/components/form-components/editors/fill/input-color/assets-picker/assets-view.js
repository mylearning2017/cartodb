var _ = require('underscore');
var cdb = require('cartodb.js');
var CoreView = require('backbone/core-view');

var MakiIcons = require('../assets/maki-icons');
var PinIcons = require('../assets/pin-icons');
var SimpleIcons = require('../assets/simple-icons');

var UserAssetsView = require('./user-assets-tab');
var UploadAssetsView = require('./upload-assets-tab');

var checkAndBuildOpts = require('../../../../../../helpers/required-opts');
var AssetsCollection = require('../../../../../../data/assets-collection');
var createTextLabelsTabPane = require('../../../../../../components/tab-pane/create-text-labels-tab-pane');
var ScrollView = require('../../../../../scroll/scroll-view');
var AssetsListView = require('./assets-list-view');
var loadingView = require('../../../../../loading/render-loading');
var ErrorView = require('../../../../../error/error-view');
var errorTemplate = require('./upload-assets-error.tpl');

var template = require('./assets-view.tpl');

var REQUIRED_OPTS = [
  'modalModel',
  'configModel',
  'userModel'
];

module.exports = CoreView.extend({
  className: 'Dialog-content Dialog-content--expanded',

  events: {
    'click .js-add': '_onSetImage',
    'click .js-upload': '_initUpload',
    'change .js-fileInput': '_onFileSelected',
    'click .js-back': '_onClickBack'
  },

  initialize: function (opts) {
    checkAndBuildOpts(opts, REQUIRED_OPTS, this);

    this._numOfUploadingProcesses = 0;

    this._initModels();
    this._initTabPane();
    this._initBinds();
  },

  render: function () {
    this.clearSubViews();

    this.$el.append(this._assetsTabPaneView.render().$el);

    if (this._isLoading()) {
      this._renderLoading();
    } else if (this._hasError()) {
      this._renderError();
    }

    if (this.model.get('image')) {
      this.$('.js-add').removeClass('is-disabled');
    }

    return this;
  },

  _initModels: function () {
    this._selectedAsset = new cdb.core.Model({
      url: this.model.get('image')
    });

    this.add_related_model(this._selectedAsset);

    this._stateModel = new cdb.core.Model({
      status: 'show'
    });

    this.add_related_model(this._stateModel);

    this._assetCollection = new AssetsCollection(
      null, {
        configModel: this._configModel,
        userModel: this._userModel
      }
    );
  },

  _initBinds: function () {
    this._selectedAsset.on('change:url', this._onChangeSelectedAsset, this);
    this._stateModel.on('change:status', this.render, this);
    this._assetsTabPaneView.collection.bind('change', this._onChangeSelectedTab, this);
  },

  _onClickBack: function (e) {
    this.killEvent(e);
    this._stateModel.set('status', '');
  },

  _upload: function (data) {
    this._assetCollection.create(data, {
      beforeSend: this._beforeAssetUpload.bind(this),
      success: this._onAssetUploaded.bind(this),
      error: this._onAssetUploadError.bind(this),
      complete: this._onAssetUploadComplete.bind(this)
    });
  },

  _renderError: function () {
    this._hideDisclaimer();

    this.$('.js-content').html(
      new ErrorView({
        title: this._stateModel.get('error_message'),
        desc: _t('components.modals.assets-picker.error-desc'),
        template: errorTemplate
      }).render().$el
    );
  },

  _renderLoading: function () {
    this._hideDisclaimer();

    this.$('.js-content').html(
      loadingView({
        title: _t('components.modals.assets-picker.loading')
      })
    );
  },

  _isLoading: function () {
    return this._stateModel.get('status') === 'loading';
  },

  _hasError: function () {
    return this._stateModel.get('status') === 'error';
  },

  _initTabPane: function () {
    var self = this;

    var tabPaneTabs = [{
      name: 'maki-icons',
      label: _t('components.modals.add-asset.maki-icons'),
      createContentView: self._createMakiIconsView.bind(self)
    }, {
      name: 'simple-icons',
      label: _t('components.modals.add-asset.simple-icons'),
      createContentView: self._createSimpleIconsView.bind(self)
    }, {
      name: 'pin-icons',
      label: _t('components.modals.add-asset.pin-icons'),
      createContentView: self._createPinIconsView.bind(self)
    }, {
      name: 'your-uploads',
      label: _t('components.modals.add-asset.your-uploads'),
      createContentView: self._createYourUploadsView.bind(self)
    }, {
      name: 'upload-file',
      label: _t('components.modals.add-asset.upload-file'),
      createContentView: self._createUploadFileView.bind(self)
    }];

    var tabPaneOptions = {
      tabPaneOptions: {
        template: template,
        disclaimer: MakiIcons.disclaimer,
        tabPaneItemOptions: {
          tagName: 'li',
          className: 'CDB-NavSubmenu-item'
        }
      },
      tabPaneItemLabelOptions: {
        tagName: 'button',
        className: 'CDB-NavSubmenu-link u-upperCase Publish-modalLink'
      }
    };

    this._assetsTabPaneView = createTextLabelsTabPane(tabPaneTabs, tabPaneOptions);
    this.addView(this._assetsTabPaneView);
  },

  _onChangeSelectedTab: function () {
    switch (this._assetsTabPaneView.getSelectedTabPaneName()) {
      case 'simple-icons':
        this._setDisclaimer(SimpleIcons.disclaimer);
        break;
      case 'maki-icons':
        this._setDisclaimer(MakiIcons.disclaimer);
        break;
      case 'pin-icons':
        this._setDisclaimer(PinIcons.disclaimer);
        break;
      case 'upload-file':
        this._selectedAsset.set({
          url: '',
          kind: ''
        });
        this._hideDisclaimer();
        break;
      default:
        this._hideDisclaimer();
        break;
    }
  },

  _createYourUploadsView: function () {
    var view = new UserAssetsView({
      model: this.model,
      selectedAsset: this._selectedAsset,
      title: _t('components.modals.add-asset.your-uploads'),
      userModel: this._userModel,
      configModel: this._configModel
    }).bind(this);

    this._userAssetsView = view;

    view.bind('init-upload', this._initUpload, this);

    this._hideDisclaimer();

    return this._userAssetsView;
  },

  _createUploadFileView: function () {
    var view = new UploadAssetsView({
      model: this.model,
      userModel: this._userModel,
      configModel: this._configModel
    }).bind(this);
    view.bind('upload-complete', this._onUploadComplete, this);
    return view;
  },

  _createSimpleIconsView: function () {
    return new ScrollView({
      createContentView: function () {
        return new AssetsListView({
          model: this.model,
          selectedAsset: this._selectedAsset,
          title: _t('components.modals.add-asset.simple-icons'),
          icons: SimpleIcons.icons,
          folder: 'simpleicon',
          kind: 'marker',
          size: ''
        });
      }.bind(this)
    });
  },

  _createMakiIconsView: function () {
    return new ScrollView({
      createContentView: function () {
        return new AssetsListView({
          model: this.model,
          selectedAsset: this._selectedAsset,
          title: _t('components.modals.add-asset.maki-icons'),
          icons: MakiIcons.icons,
          folder: 'maki-icons',
          kind: 'marker',
          size: '18'
        });
      }.bind(this)
    });
  },

  _createPinIconsView: function () {
    return new ScrollView({
      createContentView: function () {
        return new AssetsListView({
          model: this.model,
          selectedAsset: this._selectedAsset,
          title: _t('components.modals.add-asset.pin-icons'),
          icons: PinIcons.icons,
          folder: 'pin-maps',
          kind: 'marker',
          size: ''
        });
      }.bind(this)
    });
  },

  _onFetchAssetsError: function () {
    this._showErrorMessage(this._fetchErrorMessage);
  },

  _onUploadComplete: function () {
    this._assetsTabPaneView.setSelectedTabPaneByName('your-uploads');
  },

  _onChangeSelectedAsset: function () {
    this.$('.js-add').toggleClass('is-disabled', !this._selectedAsset.get('url'));
  },

  _initUpload: function (e) {
    this.killEvent(e);
    this.$('.js-fileInput').click();
  },

  _setDisclaimer: function (disclaimer) {
    this.$('.js-disclaimer').html(disclaimer);
  },

  _hideDisclaimer: function () {
    this.$('.js-disclaimer').html('');
  },

  _onFileSelected: function () {
    var files = this.$('.js-fileInput').prop('files');

    _.each(files, function (file) {
      this._upload({
        kind: 'marker',
        type: 'file',
        filename: file
      });
    }, this);
  },

  _beforeAssetUpload: function () {
    this._numOfUploadingProcesses++;

    if (this._numOfUploadingProcesses > 0) {
      this._stateModel.set('status', 'loading');
    }
  },

  _onAssetUploaded: function (iconModel) {
    this._resetFileSelection();
  },

  _parseResponseText: function (response) {
    if (response && response.responseText) {
      try {
        var text = JSON.parse(response.responseText);
        if (text && text.errors && typeof text.errors === 'string') {
          return text.errors;
        }
      } catch (exc) {
        // Swallow
      }
    }
    return '';
  },

  _onAssetUploadError: function (model, response) {
    this._resetFileSelection();

    this._stateModel.set({
      error_message: this._parseResponseText(response),
      status: 'error'
    });
  },

  _onAssetUploadComplete: function () {
    this._numOfUploadingProcesses--;

    if (this._numOfUploadingProcesses < 1 && !this._hasError()) {
      this._onUploadComplete();
      this._stateModel.set('status', '');
    }
  },

  _resetFileSelection: function () {
    this.$('.js-fileInput').val('');
  },

  _onSetImage: function (e) {
    this.killEvent(e);

    if (!this._selectedAsset.get('url')) {
      return;
    }

    this.model.set({
      image: this._selectedAsset.get('url'),
      kind: this._selectedAsset.get('kind')
    });

    this.trigger('change', {
      url: this._selectedAsset.get('url'),
      kind: this._selectedAsset.get('kind')
    }, this);

    this._modalModel.destroy(this.model);
  }
});