(function ($) {
  // Multi-page row selection, stored per-table in localStorage, plus a "select all" flag
  function getSelKey() { return $('#sel-key').val(); }
  function allKey() { return getSelKey() + '.all'; }
  function isAll() { try { return localStorage.getItem(allKey()) === '1'; } catch (e) { return false; } }
  function setAll(v) { try { if (v) localStorage.setItem(allKey(), '1'); else localStorage.removeItem(allKey()); } catch (e) {} }
  function getSelection() { try { return JSON.parse(localStorage.getItem(getSelKey()) || '[]'); } catch (e) { return []; } }
  function setSelection(a) { try { localStorage.setItem(getSelKey(), JSON.stringify(a)); } catch (e) {} }
  function getTotal() { var n = parseInt($('#sel-key').attr('data-total') || '0', 10); return isNaN(n) ? 0 : n; }
  function updateSelCount() {
    var $c = $('#sel-count');
    if (!$c.length) return;
    var n = isAll() ? getTotal() : getSelection().length;
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
        var port = $driver.find('option:selected').attr('data-port') || '';
        $('#fld-server input').attr('placeholder', isSqlite ? '/path/to/database.sqlite' : 'localhost:' + port);
      };
      $driver.on('change', loginDriver);
      loginDriver();
    }

    // Restore selection state for rows rendered on this page
    if (isAll()) {
      $('.select-all-page').prop('checked', true);
      $('.row-sel').each(function () { this.checked = true; this.disabled = true; });
      $('#bulk-all').val('1');
    } else {
      var sel = getSelection();
      $('.row-sel').each(function () {
        if (sel.indexOf($(this).attr('data-key')) >= 0) this.checked = true;
      });
    }
    updateSelCount();
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
    if (isAll()) return;
    var key = $(this).attr('data-key');
    var sel = getSelection();
    var i = sel.indexOf(key);
    if (this.checked) { if (i < 0) sel.push(key); }
    else if (i >= 0) sel.splice(i, 1);
    setSelection(sel);
    updateSelCount();
  });

  // Select all / deselect all rows across every page of the dataset
  $(document).on('change', '.select-all-page', function () {
    var checked = this.checked;
    setAll(checked);
    setSelection([]);
    if (checked) {
      $('.row-sel').each(function () { this.checked = true; this.disabled = true; });
      $('#bulk-all').val('1');
    } else {
      $('.row-sel').each(function () { this.checked = false; this.disabled = false; });
      $('#bulk-all').val('0');
    }
    updateSelCount();
  });

  // Bulk actions ("With Selected Items")
  $(document).on('submit', '#bulk-form', function (e) {
    e.preventDefault();
    var form = this;
    var all = isAll();
    var sel = all ? [] : getSelection();
    if (all) {
      $('#bulk-all').val('1');
      $('#bulk-rows').val('[]');
    } else {
      $('#bulk-all').val('0');
      $('#bulk-rows').val(JSON.stringify(sel));
      if (!sel.length) { Cordoba.alert('No rows selected.', 'Notice'); return; }
    }
    var action = $('#bulk-action').val();
    var label = all ? (getTotal() + ' rows') : (sel.length + ' row' + (sel.length === 1 ? '' : 's'));
    if (action === 'delete') {
      Cordoba.danger('Delete ' + label + '?', 'Are you sure?').then(function (ok) { if (ok) form.submit(); });
    } else {
      Cordoba.confirm('Export ' + label + '?', 'Confirm', 'Export', 'btn-primary').then(function (ok) { if (ok) form.submit(); });
    }
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

  // Restore/persist field drafts so Edit → Save/Cancel returns to the same inputs
  $(function () {
    var $sql = $('textarea[name="sql"]');
    if ($sql.length) {
      var sd = localStorage.getItem('dbxadm2.sqldraft');
      if (sd !== null) $sql.val(sd);
      $sql.on('input', function () { try { localStorage.setItem('dbxadm2.sqldraft', this.value); } catch (e) {} });
    }
    var $dk = $('#draft-key');
    if ($dk.length) {
      var dk = $dk.val();
      var $where = $('input[name="where"]');
      var $order = $('input[name="order"]');
      if ($where.length) {
        var wd = localStorage.getItem(dk + '.where');
        if (wd !== null) $where.val(wd);
        $where.on('input', function () { try { localStorage.setItem(dk + '.where', this.value); } catch (e) {} });
      }
      if ($order.length) {
        var od = localStorage.getItem(dk + '.order');
        if (od !== null) $order.val(od);
        $order.on('input', function () { try { localStorage.setItem(dk + '.order', this.value); } catch (e) {} });
      }
    }
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

  // Variables/status filter
  $(document).on('keyup', '#filter', function () {
    var q = String(this.value).toLowerCase();
    $('#vars tbody tr').each(function () {
      $(this).toggle($(this).text().toLowerCase().indexOf(q) > -1);
    });
  });
})(jQuery);
