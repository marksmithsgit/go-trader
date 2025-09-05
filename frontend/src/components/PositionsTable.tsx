import { useStore } from '../store/store';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { Position } from '../types';

export default function PositionsTable() {
  const { fullState } = useStore();

  const positions = fullState?.accountInfo?.positions || [];

  return (
    <TableContainer component={Paper} sx={{ height: '100%' }}>
      <Typography variant="h6" sx={{ p: 2 }}>
        Open Positions
      </Typography>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell>Instrument</TableCell>
            <TableCell>Type</TableCell>
            <TableCell align="right">Amount</TableCell>
            <TableCell align="right">Open Price</TableCell>
            <TableCell align="right">Stop Loss</TableCell>
            <TableCell align="right">Take Profit</TableCell>
            <TableCell align="right">P/L ($)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {positions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} align="center">
                No open positions
              </TableCell>
            </TableRow>
          ) : (
            positions.map((pos: Position) => (
              <TableRow key={pos.orderId}>
                <TableCell>{pos.instrument}</TableCell>
                <TableCell>{pos.orderCommand}</TableCell>
                <TableCell align="right">{pos.amount}</TableCell>
                <TableCell align="right">{pos.openPrice.toFixed(5)}</TableCell>
                <TableCell align="right">{pos.stopLoss.toFixed(5)}</TableCell>
                <TableCell align="right">{pos.takeProfit.toFixed(5)}</TableCell>
                <TableCell align="right" sx={{ color: pos.pnl >= 0 ? 'success.main' : 'error.main' }}>
                  {pos.pnl.toFixed(2)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
