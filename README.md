# MINEFALL 1.0.0-rc.2 — Browser Multiplayer Release Candidate

MINEFALL là game dò mìn PvP trên trình duyệt, có chế độ offline và phòng online 2–5 người. Bản này chuẩn bị quy trình kiểm thử tự động và triển khai public từ GitHub.

> **Trạng thái:** Release Candidate, chưa ký phát hành v1.0 chính thức. Bộ test tự động không thay thế kiểm thử trận online giữa nhiều trình duyệt/thiết bị. Xem [VERSION_1.0_RELEASE_GATES.md](./VERSION_1.0_RELEASE_GATES.md).

## Cách chơi trên máy tính

Yêu cầu Node.js 20+ (khuyến nghị Node.js 22) và npm. Mở PowerShell trong thư mục gốc của dự án, nơi có `package.json`, rồi chạy:

```powershell
npm install
npm test
npm run smoke
npm start
```

Mở `http://localhost:3000`. Trang `/health` trả về trạng thái server và số phiên bản. Lệnh `npm run smoke` kiểm tra HTTP, các asset chính và bắt tay WebSocket.

Trên Windows, `start-minefall.bat` cũng có thể cài dependency còn thiếu và chạy server. Khi chơi qua Internet, không cần mở cửa sổ Cloudflare Tunnel nếu đã triển khai public theo hướng dẫn bên dưới.

## Triển khai public từ GitHub

### Vì sao không chỉ dùng GitHub Pages?

GitHub Pages chỉ phục vụ file tĩnh; MINEFALL cần một server Node.js chạy liên tục để xử lý phòng và WebSocket. Nếu tải riêng `index.html` lên Pages, giao diện có thể hiện nhưng phòng online sẽ không hoạt động. Cấu hình hiện tại dùng **GitHub làm kho source** và **Render Web Service để chạy cả giao diện lẫn WebSocket cùng một origin**, tránh phải cấu hình URL WebSocket chéo miền.

### Thiết lập một lần

1. Tạo repository GitHub mới tên `MINEFALL` hoặc tên khác mày thích. Đưa toàn bộ nội dung thư mục này lên, gồm `render.yaml`, `.github/workflows/`, `scripts/`, `server/`, `assets/`, `index.html` và `package.json`. Không tải `node_modules/` hay file `.env` lên.
2. Mở Render và tạo **Blueprint** mới, kết nối repository GitHub vừa tạo, rồi để Render đọc cấu hình `render.yaml`.
3. Chờ build/deploy thành công. Render sẽ khởi động `npm start`, kiểm tra `/health` và cấp một địa chỉ HTTPS công khai.
4. Mở địa chỉ HTTPS đó. Tạo phòng và tham gia bằng một trình duyệt/thiết bị khác để kiểm tra WebSocket qua `wss://`.
5. Mỗi lần push code lên nhánh chính, Render có thể tự triển khai bản cập nhật theo cấu hình dịch vụ; GitHub Actions sẽ chạy kiểm tra cú pháp, audit asset, unit tests và server smoke test.

Chi tiết thao tác được ghi trong [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).

### Lưu ý về host miễn phí

Blueprint mặc định dùng gói thử nghiệm miễn phí. Dịch vụ có thể ngủ sau thời gian không có lưu lượng và cần khoảng một phút để thức dậy khi có lượt truy cập mới. Phòng/trận hiện được lưu trong RAM của server, chưa dùng cơ sở dữ liệu bền vững; vì vậy **không coi bản miễn phí này là máy chủ thi đấu ổn định**. Khởi động lại hoặc triển khai lại server có thể làm mất phòng đang mở. Đừng tổ chức trận quan trọng trên bản RC này.

## Kiểm thử và kiểm soát chất lượng

- `npm test`: kiểm thử tự động engine, luật tính điểm, protocol, phòng online, UI wiring và cosmetics.
- `npm run smoke`: khởi động server trên một cổng tạm, kiểm tra `/health`, HTML/JS/CSS, SVG và WebSocket hello.
- `node scripts/check-inline-js.js`: kiểm tra cú pháp các khối JavaScript nhúng trong `index.html`.
- `node scripts/audit-static-assets.js`: xác minh asset SVG trong catalogue có file tương ứng và ID skin đúng định dạng.
- `.github/workflows/ci.yml`: tự động chạy các kiểm tra trên GitHub Actions khi push hoặc tạo pull request.

Báo cáo test trước cấu hình deploy ghi nhận **65 bài test tự động PASS**. Trong môi trường tạo gói hiện tại, `npm install` không hoàn tất do không phân giải được `registry.npmjs.org`; vì vậy chưa thể chạy `npm run smoke` hoặc xác nhận server thật khởi động trong môi trường này. GitHub Actions/host cần hoàn tất smoke test trước khi phát hành. Màn khoang đáp offline lấy kích thước và số mìn trực tiếp từ bàn cờ đã sinh; màn online lấy kích thước từ snapshot có thẩm quyền của server. Xem [TEST_REPORT_V1.0_RC2.md](./TEST_REPORT_V1.0_RC2.md).

Repository ZIP không kèm `package-lock.json` vì môi trường đóng gói không truy cập được npm registry để tạo lockfile hợp lệ. Trên máy có Internet, chạy `npm install`; giữ lại `package-lock.json` mà npm tạo ra và commit cùng source. GitHub Actions và Render hiện dùng `npm install`, nên lần push đầu không bị chặn nếu lockfile chưa có, nhưng nên commit lockfile để các lần cài sau tái lập dependency ổn định hơn.

## Luật chơi hiện tại

- Phòng riêng online hỗ trợ 2–5 người; kích thước bản đồ từ 8×8 đến 20×20.
- Độ khó hiển thị Dễ / Trung bình / Khó; mật độ mìn tương ứng 25% / 35% / 50%.
- Di chuyển không kết thúc lượt. Đào, cắm cờ hoặc gỡ cờ của mình kết thúc lượt.
- Lượt có thời hạn 60 giây; bỏ lượt bị phạt −5 điểm.
- Thời lượng trận chọn được: 10, 15, 20, 25 hoặc 30 phút. Server là nguồn chuẩn cho đồng hồ và luật online.
- Chế độ Standard không cho gỡ cờ của đối thủ. Chế độ Hỗn loạn chưa nằm trong bản RC này.
- Cosmetic không được thay đổi xác suất mìn, khả năng nhìn, tốc độ, thời gian hành động hoặc điểm số.

## Dữ liệu và giới hạn hiện tại

Xu, vật phẩm đã sở hữu và loadout được lưu bằng `localStorage` trên trình duyệt hiện tại. Bản này chưa có tài khoản người dùng, cloud save, chuyển tiến trình giữa thiết bị, leaderboard toàn cầu hay lưu phòng qua lần server khởi động lại.

## Cấu trúc quan trọng

- `index.html`, `online.css`, `online-client.js`: giao diện, shop, client multiplayer.
- `engine.js`: luật chơi, tạo bản đồ và điểm.
- `cosmetics.js`: catalogue cosmetic dùng chung cho browser/server.
- `server/index.js`, `server/room-manager.js`: HTTP, WebSocket và authoritative room state.
- `assets/flags/`, `assets/mines/`, `assets/skins/`: asset hình ảnh.
- `tests/`: kiểm thử tự động.
- `scripts/`: kiểm tra cú pháp, asset và smoke test server.
- `render.yaml`: cấu hình deploy Node service trên Render.
- `.github/workflows/ci.yml`: CI tự động trên GitHub Actions.
- `VERSION_1.0_RELEASE_GATES.md`: điều kiện bắt buộc để ký phát hành v1.0.
- `VIP_ROADMAP_1.0.1_to_1.1.md`: lộ trình các tính năng sau v1.0.
