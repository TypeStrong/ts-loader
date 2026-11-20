// the error's elaboration ("Types of parameters...") arrives in the diagnostic's message chain
export const handler: (options: { name: string }) => void = (options: { name: number }) => {
    console.log(options.name);
};
