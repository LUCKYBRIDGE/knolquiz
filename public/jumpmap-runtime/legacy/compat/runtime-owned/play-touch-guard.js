(() => {
  const params = new URLSearchParams(window.location.search);
  const launchMode = String(params.get('launchMode') || '').trim().toLowerCase();
  const fromLauncher = String(params.get('fromLauncher') || '').trim().toLowerCase();
  const isPlayLaunch = launchMode === 'play' && ['1', 'true', 'yes', 'on'].includes(fromLauncher);
  if (!isPlayLaunch) return;

  const shouldAllowNativeUi = (target) => {
    if (!(target instanceof Element)) return false;
    return !!target.closest(
      'input, textarea, select, [contenteditable="true"], [data-allow-contextmenu="true"]'
    );
  };

  const isRuntimeUiTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return !!target.closest('.test-overlay, .test-view, .virtual-controls, .test-top-hud, .test-quiz-panel');
  };

  const isControlTouchTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return !!target.closest(
      '.dpad button, .jump-btn button, .test-quiz-button, .virtual-controls, .control-box'
    );
  };

  const blockNativeUi = (event) => {
    if (shouldAllowNativeUi(event.target)) return;
    if (!isRuntimeUiTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  document.addEventListener('contextmenu', blockNativeUi, true);
  document.addEventListener('auxclick', (event) => {
    if (event.button !== 2) return;
    blockNativeUi(event);
  }, true);

  document.addEventListener('selectstart', (event) => {
    if (shouldAllowNativeUi(event.target)) return;
    if (!isControlTouchTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('dragstart', (event) => {
    if (shouldAllowNativeUi(event.target)) return;
    if (!isControlTouchTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('touchstart', (event) => {
    if (shouldAllowNativeUi(event.target)) return;
    if (!isControlTouchTarget(event.target)) return;
    event.preventDefault();
  }, { capture: true, passive: false });

  document.addEventListener('touchmove', (event) => {
    if (shouldAllowNativeUi(event.target)) return;
    if (!isControlTouchTarget(event.target)) return;
    event.preventDefault();
  }, { capture: true, passive: false });
})();
