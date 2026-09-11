const express = require('express');
const router = express.Router();
const PartidoController = require('../controllers/PartidoController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

router.get('/mis-partidos', PartidoController.misPartidos);
router.get('/fase/:fase_id', PartidoController.showByFase);
router.get('/entre/:inicio/:fin', PartidoController.buscarPorFecha);
router.get('/', PartidoController.index);
router.post('/', PartidoController.store);
router.get('/:id', PartidoController.show);
router.put('/:id', PartidoController.update);
router.patch('/:id', PartidoController.update);
router.delete('/:id', PartidoController.delete);

module.exports = router;
