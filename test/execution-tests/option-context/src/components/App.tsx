import * as React from 'react';
import enhanceWithClickOutside from 'react-click-outside';

const App: React.SFC<{ name: string }> = ({ name }) => 
    <div className="container-fluid">
      <h1>Hello {name}!</h1>
    </div>;

const COApp = enhanceWithClickOutside(App)

export default App;
export {
  COApp
}
