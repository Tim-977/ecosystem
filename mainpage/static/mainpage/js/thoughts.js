document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.querySelector('textarea[name="thoughts"]');
    if (!textarea) return;
  
    const max = 115;
    const counter = document.createElement('div');
    counter.id = 'thoughts-counter';
    counter.style.textAlign = 'right';
    counter.style.fontSize = '0.9em';
    counter.style.marginTop = '5px';
    counter.textContent = `${max - textarea.value.length} characters remaining`;
    textarea.parentNode.insertBefore(counter, textarea.nextSibling);
  
    textarea.addEventListener('input', () => {
      let text = textarea.value;
      if (text.length > max) {
        textarea.value = text.slice(0, max);
        text = textarea.value;
      }
      counter.textContent = `${max - text.length} characters remaining`;
    });
  });
  