const router = require('express').Router();
const ctrl   = require('../controllers/esign.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin')];

// Public signing endpoint — no auth
router.get('/sign/:token', ctrl.signViaToken);

router.get('/',    ...auth, ctrl.list);
router.post('/',   ...auth, ctrl.create);
router.get('/:id', ...auth, ctrl.get);
router.put('/:id', ...auth, ctrl.update);
router.delete('/:id', ...auth, ctrl.remove);
router.post('/:id/send',   ...auth, ctrl.send);
router.post('/:id/void',   ...auth, ctrl.void);
router.post('/:id/resend', ...auth, ctrl.resend);

module.exports = router;
