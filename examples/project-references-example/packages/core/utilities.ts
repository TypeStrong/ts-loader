
const dogNames = "Baxter Bear Beau Benji Benny Benny Bentley Blue Bo Boomer Brady Brody Bruno Brutus Bubba Buddy Buster Cash Champ Chance Charlie Chase Chester Chico Coco Cody Cooper Copper Dexter Diesel Duke Elvis Finn Frankie George Gizmo Gunner Gus Hank Harley Henry Hunter Jack Jackson Jake Jasper Jax Joey Kobe Leo Loki Louie Lucky Luke Mac Marley Max Mickey Milo Moose Murphy Oliver Ollie Oreo Oscar Otis Peanut Prince Rex Riley Rocco Rocky Romeo Roscoe Rudy Rufus Rusty Sam Sammy Samson Scooter Scout Shadow Simba Sparky Spike Tank Teddy Thor Toby Tucker Tyson Vader Winston Yoda Zeus Ziggy".split(' ');

function makeRandomName() {
    return dogNames[Math.floor(Math.random() * dogNames.length)];
}

function lastElementOf<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr[arr.length - 1];
}

export {
  makeRandomName,
  lastElementOf
}

