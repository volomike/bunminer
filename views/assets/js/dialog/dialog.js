/**
 * BunDB Panel Dialog — native <dialog> confirm/alert/danger, ported from Cordoba.
 * danger() adds a "Yes — do it" checkbox gate: the red button stays disabled
 * until the checkbox is ticked, so destructive actions need two explicit steps.
 */
window.Cordoba = (function ($) {
  var $dialogEl = null;
  var currentResolve = null;
  var currentButtons = null;
  var dialogEl = null;

  function getDialog() {
    if (!$dialogEl) {
      $dialogEl = $('<dialog class="cordoba-dialog">').html('<div class="cordoba-dialog-body"></div>');
      dialogEl = $dialogEl[0];
      $(document.body).append($dialogEl);

      $dialogEl.on('click', function (e) {
        if (!currentResolve) return;
        var $btn = $(e.target).closest('button[data-idx]');
        if (!$btn.length) return;
        if ($btn.prop('disabled')) return;
        var idx = parseInt($btn.attr('data-idx'));
        var resolve = currentResolve;
        currentResolve = null;
        dialogEl.close();
        if (currentButtons && currentButtons[idx] && currentButtons[idx].value !== undefined) {
          resolve(currentButtons[idx].value);
        } else {
          resolve(true);
        }
      });
    }
    return $dialogEl;
  }

  function show(title, message, buttons, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var $d = getDialog();
      var $body = $d.find('.cordoba-dialog-body');
      currentButtons = buttons;
      currentResolve = resolve;

      var btnHtml = buttons.map(function (b, i) {
        var dis = (opts.requireCheckbox && i === 0) ? ' disabled' : '';
        return '<button class="btn ' + (b.css || '') + '" data-idx="' + i + '"' + dis + '>' + b.label + '</button>';
      }).join('');

      var checkHtml = opts.requireCheckbox
        ? '<div class="dialog-check"><label><input type="checkbox" class="ays-check"> ' + (opts.checkboxLabel || 'Yes — do it') + '</label></div>'
        : '';

      $body.html('<h4>' + title + '</h4><p>' + message + '</p>' + checkHtml + '<div class="dialog-actions">' + btnHtml + '</div>');

      if (opts.requireCheckbox) {
        $body.find('.ays-check').on('change', function () {
          $body.find('button[data-idx="0"]').prop('disabled', !this.checked);
        });
      }

      function closeHandler() {
        dialogEl.removeEventListener('close', closeHandler);
        if (currentResolve) {
          var r = currentResolve;
          currentResolve = null;
          r(false);
        }
      }
      dialogEl.addEventListener('close', closeHandler);

      dialogEl.showModal();
      setTimeout(function () {
        if (opts.requireCheckbox) { $body.find('.ays-check').focus(); }
        else { $body.find('button').focus(); }
      }, 50);
    });
  }

  return {
    confirm: function (message, title, primaryLabel, primaryClass) {
      var label = primaryLabel || 'Delete';
      var css = primaryClass || 'btn-danger';
      return show(title || 'Confirm', message, [
        { label: label, css: css, value: true },
        { label: 'Cancel', css: 'btn-cancel', value: false }
      ]);
    },
    danger: function (message, title, primaryLabel) {
      return show(title || 'Are you sure?', message, [
        { label: primaryLabel || 'Do it', css: 'btn-danger', value: true },
        { label: 'Cancel', css: 'btn-cancel', value: false }
      ], { requireCheckbox: true, checkboxLabel: 'Yes — do it' });
    },
    alert: function (message, title) {
      return show(title || 'Notice', message, [
        { label: 'OK', css: 'btn-primary', value: true }
      ]);
    },
    threeButton: function (message, title, buttons) {
      return show(title || 'Confirm', message, buttons);
    }
  };
})(jQuery);
