(function ($) {
  // Multi-page row selection (select page), stored per-table in localStorage
  function getSelKey() { return $('#sel-key').val(); }
  function getSelection() { try { return JSON.parse(localStorage.getItem(getSelKey()) || '[]'); } catch (e) { return []; } }
  function setSelection(a) { try { localStorage.setItem(getSelKey(), JSON.stringify(a)); } catch (e) {} }
  function updateSelCount() {
    var $c = $('#sel-count');
    if (!$c.length) return;
    var n = getSelection().length;
    $c.text(n ? n + ' selected' : '');
  }

  $(function () {
    // Login page: toggle fields based on selected system
    var $driver = $('#driver');
    if ($driver.length) {
      var loginDriver = function () {
        var isSqlite = $driver.val() === 'sqlite';
        $('#fld-username, #fld-password, #fld-db').toggle(!isSqlite);
        $('#fld-server label').text(isSqlite ? 'SQLite file path' : 'Server');
      };
      $driver.on('change', loginDriver);
      loginDriver();
    }

    // Restore selection state for rows rendered on this page
    var sel = getSelection();
    $('.row-sel').each(function () {
      if (sel.indexOf($(this).attr('data-key')) >= 0) this.checked = true;
    });
    updateSelCount();
  });

  // Pagination preference — per-browser via localStorage (not shared between users on the same login)
  $(function () {
    var $limit = $('select[name="limit"]');
    if (!$limit.length) return;
    var key = 'dbxadm2.pagination';
    var saved = localStorage.getItem(key);
    if (saved && !new URLSearchParams(window.location.search).has('limit')) {
      var n = parseInt(saved, 10);
      if (!isNaN(n)) {
        var u = new URL(window.location.href);
        u.searchParams.set('limit', n);
        window.location.href = u.toString();
        return;
      }
    }
    $limit.on('change', function () {
      localStorage.setItem(key, this.value);
      this.form.submit();
    });
  });

  // AYS danger dialog for destructive actions
  $(document).on('click', '[data-confirm]', function (e) {
    e.preventDefault();
    var $el = $(this);
    var msg = $el.attr('data-confirm') || 'Are you sure?';
    Cordoba.danger(msg, 'Are you sure?').then(function (ok) {
      if (!ok) return;
      var $form = $el.closest('form');
      if ($form.length) {
        $el.removeAttr('data-confirm');
        $form[0].submit();
      } else {
        window.location.href = $el.attr('href') || '/';
      }
    });
  });

  // Row checkbox selection (persists across pages)
  $(document).on('change', '.row-sel', function () {
    var key = $(this).attr('data-key');
    var sel = getSelection();
    var i = sel.indexOf(key);
    if (this.checked) { if (i < 0) sel.push(key); }
    else if (i >= 0) sel.splice(i, 1);
    setSelection(sel);
    updateSelCount();
  });

  // Select all rows on this page
  $(document).on('change', '.select-all-page', function () {
    var checked = this.checked;
    $('.row-sel').each(function () { $(this).prop('checked', checked).trigger('change'); });
  });

  // Bulk actions ("With Selected Items")
  $(document).on('submit', '#bulk-form', function (e) {
    e.preventDefault();
    var form = this;
    var sel = getSelection();
    if (!sel.length) { Cordoba.alert('No rows selected.', 'Notice'); return; }
    $('#bulk-rows').val(JSON.stringify(sel));
    var action = $('#bulk-action').val();
    var label = sel.length + ' row' + (sel.length === 1 ? '' : 's');
    if (action === 'delete') {
      Cordoba.danger('Delete ' + label + '?', 'Are you sure?').then(function (ok) { if (ok) form.submit(); });
    } else {
      Cordoba.confirm('Export ' + label + '?', 'Confirm', 'Export', 'btn-primary').then(function (ok) { if (ok) form.submit(); });
    }
  });

  // Variables/status filter
  $(document).on('keyup', '#filter', function () {
    var q = String(this.value).toLowerCase();
    $('#vars tbody tr').each(function () {
      $(this).toggle($(this).text().toLowerCase().indexOf(q) > -1);
    });
  });

  // Create-table form: add/remove column rows
  $(document).on('click', '#add-col', function () {
    var idx = $('#cols-rows tr[data-col]').length;
    var tpl = $('#col-row-tpl').html() || '';
    $('#cols-rows').append(tpl.split('__IDX__').join(idx));
  });
  $(document).on('click', '.col-del', function () {
    $(this).closest('tr[data-col]').remove();
  });

  // Drag-and-drop column reorder (MariaDB only — jQuery UI sortable)
  $(function () {
    var $sort = $('#cols-sort');
    if (!$sort.length || !$.fn.sortable) return;
    $sort.sortable({
      handle: '.sort-handle',
      axis: 'y',
      update: function () {
        var order = $sort.find('tr[data-name]').map(function () { return $(this).attr('data-name'); }).get();
        $('#cols-order').val(order.join(','));
        $('#reorder-form')[0].submit();
      }
    });
  });

  // PostgreSQL schema selector auto-submit (CSP-safe — no inline handlers)
  $(document).on('change', '#schema-select', function () {
    this.form.submit();
  });
})(jQuery);
