import * as React from 'react';
import enhanceWithClickOutside from 'react-click-outside';

const DeepApp: React.SFC<{ name: string }> = ({ name }) => 
    <div className="container-fluid">
      <h1>Hello {name}!</h1>
    </div>;

const CODeepApp = enhanceWithClickOutside(DeepApp)

export default DeepApp;
export {
  CODeepApp
}
