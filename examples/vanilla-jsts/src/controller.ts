interface MessageState {
  message: string;
}

class MessageController {
  private _state: MessageState;

  constructor() {
    this._state = this.defaultState;
  }

  get defaultState() {
    return {
      message: '',
    }
  }

  _update(props: Partial<MessageState>) {
    Object.assign(this._state, props);
  }

  setMessage(message: string) {
    this._update({message});
  }

  getHtml(): string {
    return `<h1>${this._state.message}</h1>`;
  }
}

export default new MessageController();
