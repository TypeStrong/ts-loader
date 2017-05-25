import React from 'react';

import * as GreetingActions from '../actions/GreetingActions';

interface Props {
  key: number;
  targetOfGreeting: string;
}

class Greeting extends React.Component<Props, any> {
  constructor(props: Props) {
    super(props);
  }

  static propTypes: React.ValidationMap<Props> = {
    targetOfGreeting: React.PropTypes.string.isRequired
  }

  render() {
    return (
      <p>
        Hello { this.props.targetOfGreeting }!

        <button className="btn btn-default btn-danger"
                onClick={ this._onClick }>
                Remove
        </button>
      </p>
    );
  }

  _onClick = (_event: React.MouseEvent<HTMLButtonElement>) => {
    GreetingActions.removeGreeting(this.props.targetOfGreeting);
  }
}

export default Greeting;
