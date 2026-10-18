const {setIcon} = require('obsidian');

function createGroupToggle(parent, {name, icon = 'layout-grid', className = '', open = true, onToggle}) {
  const button = parent.createEl('button', {cls:`ps-group-toggle ${className}`, attr:{type:'button'}});
  const symbol = button.createSpan({cls:'ps-group-icon'});
  setIcon(symbol, icon);
  button.createSpan({cls:'ps-group-label', text:name});
  const chevron = button.createSpan({cls:'ps-group-chevron'});
  const setOpen = value => {
    open = value;
    button.setAttribute('aria-expanded', String(value));
    setIcon(chevron, value ? 'chevron-down' : 'chevron-right');
  };
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!open);
    onToggle?.(open);
  });
  setOpen(open);
  return {button, setOpen};
}

module.exports = {createGroupToggle};
