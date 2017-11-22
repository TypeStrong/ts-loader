import React, {Component} from 'react';
import PropTypes from 'prop-types';

class Title extends Component {
  render() {
    return (
      <h1>Hello, {this.props.label}</h1>
    )
  }
}

Title.propTypes = {
  label: PropTypes.string
};



class App extends React.Component {
  render() {
    return (
      <Title label='title' />
    );
  }
}

export default App;