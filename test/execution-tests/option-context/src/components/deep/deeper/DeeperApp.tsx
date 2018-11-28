import * as React from 'react';
import enhanceWithClickOutside from 'react-click-outside';

const DeeperApp: React.SFC<{ name: string }> = ({ name }) => 
    <div className="container-fluid">
      <h1>Hello {name}!</h1>
    </div>;

const CODeeperApp = enhanceWithClickOutside(DeeperApp)

export default DeeperApp;
export {
  CODeeperApp
}
