import { useStore } from '../store/store';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';

export default function AccountInfo() {
  const { fullState } = useStore();

  if (!fullState || !fullState.accountInfo) {
    return (
      <Paper sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography>No account data available</Typography>
      </Paper>
    );
  }

  const { accountInfo } = fullState;
  const { account } = accountInfo;

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Account Status
      </Typography>
      <List dense>
        <ListItem>
          <ListItemText primary="Account ID" secondary={account.accountId} />
        </ListItem>
        <Divider />
        <ListItem>
          <ListItemText primary="Balance" secondary={`$${account.balance.toFixed(2)}`} />
        </ListItem>
        <Divider />
        <ListItem>
          <ListItemText primary="Equity" secondary={`$${account.equity.toFixed(2)}`} />
        </ListItem>
        <Divider />
        <ListItem>
          <ListItemText primary="Unrealized P/L" secondary={`$${account.unrealizedPnL.toFixed(2)}`} />
        </ListItem>
        <Divider />
        <ListItem>
          <ListItemText primary="Margin Used" secondary={`$${account.marginUsed.toFixed(2)}`} />
        </ListItem>
        <Divider />
        <ListItem>
          <ListItemText primary="Free Margin" secondary={`$${account.freeMargin.toFixed(2)}`} />
        </ListItem>
        <Divider />
        <ListItem>
          <ListItemText primary="Leverage" secondary={`${account.leverage}:1`} />
        </ListItem>
      </List>
    </Paper>
  );
}
