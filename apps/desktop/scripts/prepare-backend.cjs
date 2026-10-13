/* global module */
module.exports = async () => {
  const { prepareBackend } = await import('./prepare-backend.mjs');
  await prepareBackend();
};
