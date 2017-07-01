import React from 'react';

const App: React.SFC<{ name: string }> = ({ name }) => 
    <div className="container-fluid">
      <h1>Hello {name}!</h1>
    </div>;

export default App;
