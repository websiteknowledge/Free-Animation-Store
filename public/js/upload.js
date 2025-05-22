document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('uploadForm');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const formData = new FormData(form);
      const xhr = new XMLHttpRequest();

      xhr.open('POST', '/admin/upload', true);

      xhr.upload.addEventListener('progress', function (e) {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          progressBar.style.width = percent + '%';
          progressBar.textContent = percent + '%';
        }
      });

      xhr.onloadstart = function () {
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
      };

      xhr.onload = function () {
        if (xhr.status === 200) {
          window.location.href = '/admin/dashboard';
        } else {
          alert('Upload failed.');
        }
      };

      xhr.send(formData);
    });
  }
});