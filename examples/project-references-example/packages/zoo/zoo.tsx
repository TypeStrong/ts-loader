import React from 'react';
import { Dog, createDog } from '@myscope/animals';

function CreateZoo() {

  const dogs = [
      createDog(),
      createDog(),
      createDog(),
      createDog(),
      createDog(),
      createDog(),
      createDog()
  ];
  return (<>
      <h2>List of Dogs</h2>
      <hr />
      {dogs.map((dog, i) => {return(
        <div className='dog' key={i}>
          <p>Dog: {i} - Size: {dog.size} - Name: {dog.name}</p>
          <p>Bark: {dog.woof()}</p>
          <hr />
        </div>
      )})}
  </>)
}

export {
  CreateZoo
}

