import {
  CSSResultGroup,
  html,
  LitElement,
  PropertyValues,
  TemplateResult,
  unsafeCSS,
} from 'lit';
import { customElement, property } from 'lit/decorators.js';
import liveMSEStyle from '../../scss/live-mse-webrtc.scss';
import { CameraConfig, ExtendedHomeAssistant } from '../../types.js';
import '../image.js';
import {
  hideMediaControlsTemporarily,
  MEDIA_LOAD_CONTROLS_HIDE_SECONDS,
} from '../../utils/media';
import { dispatchMediaLoadedEvent } from '../../utils/media-info';
import { localize } from '../../localize/localize';
import { dispatchErrorMessageEvent } from '../message';
import { VideoRTC } from '../../external/go2rtc/video-rtc';
import { homeAssistantSignPath } from '../../utils/ha';
import { errorToConsole } from '../../utils/basic';

// Note (2023-02-18): Depending on the behavior of the player / browser is
// possible this URL will need to be re-signed in order to avoid HA spamming
// logs after the expiry time, but this complexity is not added for now until
// there are verified cases of this being an issue (see equivalent in the JSMPEG
// provider).
const GO2RTC_URL_SIGN_EXPIRY_SECONDS = 24 * 60 * 60;

@customElement('frigate-card-live-go2rtc-player')
class FrigateCardGo2RTCPlayer extends VideoRTC {
  public play(): void {
    // Let Frigate card control auto playing.
  }

  public oninit(): void {
    super.oninit();

    if (this.video) {
      const onloadeddata = this.video.onloadeddata;
      this.video.onloadeddata = (e) => {
        if (onloadeddata) {
          onloadeddata.call(this.video, e);
        }
        hideMediaControlsTemporarily(this.video, MEDIA_LOAD_CONTROLS_HIDE_SECONDS);
        dispatchMediaLoadedEvent(this, this.video);
      };
    }
  }
}

@customElement('frigate-card-live-go2rtc')
export class FrigateCardGo2RTC extends LitElement {
  // Not an reactive property to avoid resetting the video.
  public hass?: ExtendedHomeAssistant;

  @property({ attribute: false })
  public cameraConfig?: CameraConfig;

  protected _player?: FrigateCardGo2RTCPlayer;

  public play(): void {
    this._player?.video?.play();
  }

  public pause(): void {
    this._player?.video?.pause();
  }

  public mute(): void {
    if (this._player?.video) {
      this._player.video.muted = true;
    }
  }

  public unmute(): void {
    if (this._player?.video) {
      this._player.video.muted = false;
    }
  }

  public seek(seconds: number): void {
    if (this._player?.video) {
      this._player.video.currentTime = seconds;
    }
  }

  protected async _createPlayer(): Promise<void> {
    if (
      !this.hass ||
      !this.cameraConfig?.frigate.client_id ||
      !this.cameraConfig.frigate.camera_name
    ) {
      return;
    }

    let response: string | null | undefined;
    try {
      response = await homeAssistantSignPath(
        this.hass,
        `/api/frigate/${this.cameraConfig.frigate.client_id}` +
          `/mse/api/ws?src=${this.cameraConfig.frigate.camera_name}`,
        GO2RTC_URL_SIGN_EXPIRY_SECONDS,
      );
    } catch (e) {
      errorToConsole(e as Error);
      return;
    }
    if (!response) {
      return;
    }
    const url = response.replace(/^http/i, 'ws');
    if (!url) {
      return dispatchErrorMessageEvent(this, localize('error.failed_sign'));
    }

    this._player = new FrigateCardGo2RTCPlayer();
    this._player.src = url;
    this._player.visibilityCheck = false;
    this._player.background = true;
    this._player.mode = 'webrtc';

    this.requestUpdate();
  }

  protected willUpdate(changedProps: PropertyValues): void {
    if (changedProps.has('cameraConfig')) {
      this._createPlayer();
    }
  }

  protected render(): TemplateResult | void {
    return html`${this._player}`;
  }

  static get styles(): CSSResultGroup {
    return unsafeCSS(liveMSEStyle);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'frigate-card-live-go2rtc': FrigateCardGo2RTC;
  }
}
